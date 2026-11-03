import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import worker, { Env } from '../worker';
import { ACTIVITY_SCOPE, HEALTH_SCOPES, HEART_SCOPE } from '../src/health-contract';
import { challenge, FLOW_COOKIE, seal, SESSION_COOKIE, unseal } from '../worker/cookies';

const origin = 'https://form.example';
const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const refreshToken = 'fixture-refresh-token';
const accessToken = 'fixture-access-token';
const startTime = '2026-11-03T08:00:00Z', endTime = '2026-11-03T09:00:00Z';
const fixture = {
  name: 'users/fixture-user/dataTypes/exercise/dataPoints/workout-1',
  dataSource: { device: { displayName: 'Versa 4' } },
  exercise: {
    displayName: 'Synthetic gym workout', exerciseType: 'WEIGHT_TRAINING',
    interval: { startTime, endTime }, activeDuration: '3000s',
    metricsSummary: { averageHeartRateBeatsPerMinute: '125', steps: '900' },
  },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let env: Env;
let upstream: ReturnType<typeof vi.fn>;
function request(path: string, init?: RequestInit) {
  return new Request(`${origin}/api/health/${path}`, init);
}
async function auth(scopes: readonly string[] = HEALTH_SCOPES, expiresAt = Date.now() + 86400000) {
  const value = await seal({ refreshToken, scopes, expiresAt }, secret, 'session');
  return `${SESSION_COOKIE}=${value}`;
}
function post(path: string, body: unknown, authCookie: string, requestOrigin = origin) {
  return request(path, { method: 'POST', headers: { Origin: requestOrigin, Cookie: authCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const range = { day: '2026-11-03', startTime: '2026-11-02T18:30:00Z', endTime: '2026-11-03T18:30:00Z' };
async function attemptCallback() {
  const begin = await worker.fetch(request('connect'), env);
  const state = new URL(begin.headers.get('Location')!).searchParams.get('state');
  return worker.fetch(request(`callback?code=fixture&state=${state}`, { headers: { Cookie: begin.headers.getSetCookie()[0]!.split(';')[0]! } }), env);
}
function token(scopes: readonly string[] = HEALTH_SCOPES) {
  return { access_token: accessToken, refresh_token: refreshToken, scope: scopes.join(' '), refresh_token_expires_in: 604800 };
}
function mockGoogle(input: string, init?: RequestInit): Response {
  if (init?.redirect === 'error') throw new TypeError('Unsupported redirect mode: error');
  if (input === 'https://oauth2.googleapis.com/token') return json(token());
  if (input === 'https://oauth2.googleapis.com/revoke') return new Response(null, { status: 200 });
  if (input.endsWith('/identity')) return json({ healthUserId: 'fixture-user', legacyUserId: 'fixture-legacy' });
  if (input.includes('/exercise/dataPoints?')) return json({ dataPoints: [fixture] });
  if (input.endsWith('/exercise/dataPoints/workout-1')) return json(fixture);
  if (input.includes('/steps/dataPoints:rollUp')) return json({ rollupDataPoints: [{ steps: { countSum: '0' } }] });
  if (input.includes('/heart-rate/dataPoints:rollUp')) return json({ rollupDataPoints: [{ heartRate: { beatsPerMinuteAvg: 110, beatsPerMinuteMax: 175 } }] });
  throw new Error(`Unexpected fixture request: ${input} ${init?.method}`);
}
beforeEach(() => {
  env = {
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('Static app')) },
    GOOGLE_HEALTH_CLIENT_ID: 'fixture-client.apps.googleusercontent.com',
    GOOGLE_HEALTH_CLIENT_SECRET: 'fixture-client-secret',
    HEALTH_COOKIE_KEY: secret,
  };
  upstream = vi.fn(async (input: string, init?: RequestInit) => mockGoogle(input, init));
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe('Google Health authorization', () => {
  it.each([
    ['https://oauth2.googleapis.com/token', 'token_failed', 1],
    ['https://health.googleapis.com/v4/users/me/identity', 'identity_failed', 2],
  ])('rejects redirects from %s without forwarding credentials or exposing the destination', async (endpoint, expected, calls) => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input === endpoint ? new Response(null, {
      status: 307, headers: { Location: 'https://other.invalid/private-provider-location' },
    }) : mockGoogle(input, init));
    const response = await attemptCallback();
    const location = new URL(response.headers.get('Location')!);
    expect(location.searchParams.get('health_error')).toBe(expected);
    expect(location.href).not.toContain('private-provider-location');
    expect(upstream).toHaveBeenCalledTimes(calls);
    expect(upstream.mock.calls.every(call => call[1].redirect === 'manual')).toBe(true);
    expect(response.headers.getSetCookie().some(value => value.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });
  it.each([
    ['invalid_client', 'oauth_client'],
    ['unauthorized_client', 'oauth_client'],
    ['invalid_grant', 'authorization_code'],
    ['redirect_uri_mismatch', 'oauth_redirect'],
  ])('reports a safe callback reason for %s without exposing provider descriptions', async (providerError, expected) => {
    upstream.mockResolvedValueOnce(json({ error: providerError, error_description: 'private-provider-description' }, 400));
    const response = await attemptCallback();
    const location = new URL(response.headers.get('Location')!);
    expect(location.searchParams.get('health')).toBe('failed');
    expect(location.searchParams.get('health_error')).toBe(expected);
    expect(location.href).not.toContain('private-provider-description');
    expect(location.href).not.toContain(env.GOOGLE_HEALTH_CLIENT_SECRET);
    expect(response.headers.getSetCookie().some(value => value.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });
  it.each([
    ['SERVICE_DISABLED', 'api_disabled'],
    ['BILLING_DISABLED', 'billing_required'],
    ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'identity_denied'],
  ])('distinguishes a denied Health identity check: %s', async (reason, expected) => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input.endsWith('/identity') ? json({ error: { details: [{ reason }], message: 'private-provider-description' } }, 403) : mockGoogle(input, init));
    const response = await attemptCallback();
    const location = new URL(response.headers.get('Location')!);
    expect(location.searchParams.get('health_error')).toBe(expected);
    expect(location.href).not.toContain('private-provider-description');
  });
  it('distinguishes successful authorization without an offline refresh token', async () => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input === 'https://oauth2.googleapis.com/token' ? json({ access_token: accessToken, scope: HEALTH_SCOPES.join(' ') }) : mockGoogle(input, init));
    const response = await attemptCallback();
    expect(new URL(response.headers.get('Location')!).searchParams.get('health_error')).toBe('offline_access');
  });
  it('keeps the app available and reports missing server setup without exposing credentials', async () => {
    const empty = { ASSETS: env.ASSETS };
    const response = await worker.fetch(request('status'), empty);
    expect(await response.json()).toMatchObject({ configured: false, connected: false, missingConfiguration: expect.arrayContaining(['GOOGLE_HEALTH_CLIENT_ID', 'GOOGLE_HEALTH_CLIENT_SECRET', 'HEALTH_COOKIE_KEY']) });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await worker.fetch(request('connect'), empty)).status).toBe(503);
    expect(await (await worker.fetch(new Request(origin), empty)).text()).toBe('Static app');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('starts read-only OAuth with PKCE and an encrypted, host-only HttpOnly state cookie', async () => {
    const response = await worker.fetch(request('connect'), env);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('scope')?.split(' ')).toEqual([...HEALTH_SCOPES]);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe(`${origin}/api/health/callback`);
    const header = response.headers.getSetCookie()[0]!;
    expect(header).toContain('Secure; HttpOnly; SameSite=Lax');
    expect(header).not.toContain('Domain=');
    expect(header).not.toContain(env.GOOGLE_HEALTH_CLIENT_SECRET);
    const flow = await unseal(header.split(';')[0]!.split('=')[1], secret, 'oauth', z.object({ state: z.string(), verifier: z.string() }));
    expect(flow!.state).toBe(location.searchParams.get('state'));
    expect(await challenge(flow!.verifier)).toBe(location.searchParams.get('code_challenge'));
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects invalid and expired callback states before contacting Google', async () => {
    const mismatch = await worker.fetch(request('callback?code=fixture&state=wrong'), env);
    expect(mismatch.headers.get('Location')).toBe(`${origin}/?health=state`);
    const expired = await seal({ state: 'old', verifier: 'fixture', expiresAt: Date.now() - 1, redirectUri: `${origin}/api/health/callback` }, secret, 'oauth');
    const response = await worker.fetch(request('callback?code=fixture&state=old', { headers: { Cookie: `${FLOW_COOKIE}=${expired}` } }), env);
    expect(response.headers.get('Location')).toBe(`${origin}/?health=state`);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('exchanges the code using the original PKCE verifier and keeps tokens out of client-visible data', async () => {
    const begin = await worker.fetch(request('connect'), env);
    const location = new URL(begin.headers.get('Location')!);
    const flowCookie = begin.headers.getSetCookie()[0]!.split(';')[0]!;
    const response = await worker.fetch(request(`callback?code=fixture-code&state=${location.searchParams.get('state')}`, { headers: { Cookie: flowCookie } }), env);
    expect(response.headers.get('Location')).toBe(`${origin}/?health=connected`);
    const header = response.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE}=`))!;
    expect(header).toBeTruthy();
    expect(header).not.toContain(refreshToken);
    expect(header).not.toContain(accessToken);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const form = new URLSearchParams(upstream.mock.calls[0]![1].body);
    expect(await challenge(form.get('code_verifier')!)).toBe(location.searchParams.get('code_challenge'));
    expect(form.get('client_secret')).toBe(env.GOOGLE_HEALTH_CLIENT_SECRET);
    const status = await worker.fetch(request('status', { headers: { Cookie: header.split(';')[0]! } }), env);
    const body = await status.text();
    expect(JSON.parse(body)).toMatchObject({ configured: true, connected: true, scopes: [...HEALTH_SCOPES] });
    expect(body).not.toContain(refreshToken);
    expect(body).not.toContain(accessToken);
    expect(body).not.toContain('fixture-user');
  });
  it('does not mark an unlinked Google account as connected', async () => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input.endsWith('/identity') ? json({ error: { details: [{ reason: 'ACCOUNT_NOT_LINKED' }] } }, 400) : mockGoogle(input, init));
    const begin = await worker.fetch(request('connect'), env);
    const state = new URL(begin.headers.get('Location')!).searchParams.get('state');
    const response = await worker.fetch(request(`callback?code=fixture&state=${state}`, { headers: { Cookie: begin.headers.getSetCookie()[0]!.split(';')[0]! } }), env);
    expect(response.headers.get('Location')).toBe(`${origin}/?health=unlinked`);
    expect(response.headers.getSetCookie().some(value => value.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });
  it('rejects tampered cookies and cookies encrypted for a different purpose', async () => {
    const valid = await auth();
    const at = valid.indexOf('=') + 25;
    const tampered = `${valid.slice(0, at)}${valid[at] === 'A' ? 'B' : 'A'}${valid.slice(at + 1)}`;
    expect(await (await worker.fetch(request('status', { headers: { Cookie: tampered } }), env)).json()).toMatchObject({ connected: false });
    const wrong = await seal({ refreshToken, scopes: [...HEALTH_SCOPES], expiresAt: Date.now() + 100000 }, secret, 'oauth');
    expect(await (await worker.fetch(request('status', { headers: { Cookie: `${SESSION_COOKIE}=${wrong}` } }), env)).json()).toMatchObject({ connected: false });
  });
  it('requires an authenticated cookie and same-origin POSTs', async () => {
    const unauthenticated = await worker.fetch(post('overview', range, ''), env);
    expect(unauthenticated.status).toBe(401);
    const crossSite = await worker.fetch(post('disconnect', {}, await auth(), 'https://elsewhere.example'), env);
    expect(crossSite.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('clears expired connections and never echoes provider error descriptions or tokens', async () => {
    const expired = await worker.fetch(post('overview', range, await auth(HEALTH_SCOPES, Date.now() - 1)), env);
    expect(expired.status).toBe(401);
    upstream.mockResolvedValueOnce(json({ error: 'invalid_grant', error_description: 'private-provider-description' }, 400));
    const response = await worker.fetch(post('overview', range, await auth()), env);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().some(value => value.startsWith(`${SESSION_COOKIE}=`) && value.includes('Max-Age=0'))).toBe(true);
    const body = await response.text();
    expect(body).not.toContain('private-provider-description');
    expect(body).not.toContain(refreshToken);
  });
  it('disconnects locally even when Google cannot confirm revocation', async () => {
    upstream.mockRejectedValueOnce(new Error('Network failed'));
    const response = await worker.fetch(post('disconnect', {}, await auth()), env);
    expect(await response.json()).toEqual({ disconnected: true, revoked: false });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))).toBe(true);
  });
  it('revokes the refresh token without following redirects and clears the local connection', async () => {
    const response = await worker.fetch(post('disconnect', {}, await auth()), env);
    expect(await response.json()).toEqual({ disconnected: true, revoked: true });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.redirect).toBe('manual');
    expect(new URLSearchParams(init.body).get('token')).toBe(refreshToken);
    expect(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))).toBe(true);
  });
});

describe('read-only wearable data', () => {
  it('uses physical rollup ranges, civil workout dates and wearable-only sources; zero steps remain zero', async () => {
    const response = await worker.fetch(post('overview', range, await auth()), env);
    expect(response.status).toBe(200);
    const body = await response.json() as { summary: unknown; workouts: unknown[] };
    expect(body.summary).toMatchObject({ steps: 0, averageHeartRate: 110, maxHeartRate: 175 });
    expect(body.workouts).toHaveLength(1);
    const requests = upstream.mock.calls.filter(call => call[0].includes('health.googleapis.com'));
    for (const [url, init] of requests) {
      expect(init.headers.Authorization).toBe(`Bearer ${accessToken}`);
      if (url.includes(':rollUp')) {
        expect(JSON.parse(init.body)).toMatchObject({ range: { startTime: range.startTime, endTime: range.endTime }, dataSourceFamily: 'users/me/dataSourceFamilies/google-wearables' });
      } else {
        const query = new URL(url).searchParams;
        expect(query.get('filter')).toContain('exercise.interval.civil_start_time >= "2026-11-03"');
        expect(query.get('dataSourceFamily')).toBe('users/me/dataSourceFamilies/google-wearables');
      }
    }
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('supports partial consent without querying denied data', async () => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input === 'https://oauth2.googleapis.com/token' ? json(token([HEART_SCOPE])) : mockGoogle(input, init));
    const response = await worker.fetch(post('overview', range, await auth([HEART_SCOPE])), env);
    const body = await response.json() as { summary: { steps?: number; warnings: string[] }; workouts: unknown[] };
    expect(response.status).toBe(200);
    expect(body.summary.steps).toBeUndefined();
    expect(body.summary.warnings).toContain('Activity permission was not granted.');
    expect(body.workouts).toEqual([]);
    expect(upstream.mock.calls.some(call => call[0].includes('/steps/') || call[0].includes('/exercise/'))).toBe(false);
  });
  it('does not import heart-rate summaries when only activity access was granted', async () => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input === 'https://oauth2.googleapis.com/token' ? json(token([ACTIVITY_SCOPE])) : mockGoogle(input, init));
    const response = await worker.fetch(post('workout', { id: 'workout-1' }, await auth([ACTIVITY_SCOPE])), env);
    const body = await response.json() as { metrics: Record<string, unknown> };
    expect(body.metrics.steps).toBe(900);
    expect(body.metrics.averageHeartRate).toBeUndefined();
    expect(body.metrics.maxHeartRate).toBeUndefined();
    expect(upstream.mock.calls.some(call => call[0].includes('/heart-rate/'))).toBe(false);
  });
  it('uses the selected provider workout rather than trusting client-supplied timestamps', async () => {
    const response = await worker.fetch(post('workout', { id: 'workout-1', startTime: '1900-01-01T00:00:00Z' }, await auth()), env);
    const body = await response.json() as { metrics: Record<string, unknown> };
    expect(body.metrics).toMatchObject({ source: 'google-health', averageHeartRate: 125, maxHeartRate: 175, steps: 900, providerWorkoutId: 'workout-1', providerStartTime: startTime, providerEndTime: endTime });
    const rollups = upstream.mock.calls.filter(call => call[0].includes(':rollUp'));
    expect(rollups.every(call => JSON.parse(call[1].body).range.startTime === startTime)).toBe(true);
  });
  it('does not substitute missing data with zeros', async () => {
    upstream.mockImplementation(async (input: string, init?: RequestInit) => input.includes(':rollUp') ? json({ rollupDataPoints: [] }) : mockGoogle(input, init));
    const response = await worker.fetch(post('overview', range, await auth()), env);
    const body = await response.json() as { summary: Record<string, unknown> };
    expect(body).toMatchObject({ summary: { warnings: [] } });
    const summary = body.summary;
    expect(summary.steps).toBeUndefined();
    expect(summary.averageHeartRate).toBeUndefined();
  });
  it('bounds time ranges and rejects IDs that could escape the current user resource', async () => {
    expect((await worker.fetch(post('overview', { ...range, day: '2026-02-30' }, await auth()), env)).status).toBe(400);
    expect((await worker.fetch(post('overview', { ...range, endTime: '2026-11-10T18:30:00Z' }, await auth()), env)).status).toBe(400);
    expect((await worker.fetch(post('workout', { id: '../other-user' }, await auth()), env)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('retains a rotated encrypted refresh token even if the data provider rate limits the request', async () => {
    upstream.mockImplementation(async (input: string) => input === 'https://oauth2.googleapis.com/token' ? json({ ...token(), refresh_token: 'fixture-rotated-token' }) : json({ error: {} }, 429));
    const response = await worker.fetch(post('overview', range, await auth()), env);
    expect(response.status).toBe(429);
    const header = response.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE}=`))!;
    expect(header).not.toContain('fixture-rotated-token');
    const decoded = await unseal(header.split(';')[0]!.split('=')[1], secret, 'session', z.object({ refreshToken: z.string() }));
    expect(decoded!.refreshToken).toBe('fixture-rotated-token');
  });
  it('clears access when all requested permissions have been revoked', async () => {
    upstream.mockResolvedValueOnce(json({ ...token(), scope: '' }));
    const response = await worker.fetch(post('overview', range, await auth()), env);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().some(value => value.includes('Max-Age=0'))).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
