import { z } from 'zod';
import { ACTIVITY_SCOPE, HEALTH_CALLBACK, HEALTH_SCOPES, HEART_SCOPE, HealthWorkout, HealthWorkoutSchema } from '../src/health-contract';
import { DaySchema, MetricsSchema } from '../src/model';
import { challenge, cookie, FLOW_COOKIE, randomToken, readCookie, sameToken, seal, SESSION_COOKIE, unseal, validCookieKey } from './cookies';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GOOGLE_HEALTH_CLIENT_ID?: string;
  GOOGLE_HEALTH_CLIENT_SECRET?: string;
  HEALTH_COOKIE_KEY?: string;
}
const GOOGLE_API = 'https://health.googleapis.com/v4/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WEARABLES = 'users/me/dataSourceFamilies/google-wearables';
const MAX_SESSION = 30 * 86400;
const FlowSchema = z.object({ state: z.string(), verifier: z.string(), expiresAt: z.number(), redirectUri: z.string() });
const AuthSchema = z.object({
  refreshToken: z.string().min(1).max(2048), scopes: z.array(z.string()), expiresAt: z.number(),
  refreshExpiresAt: z.number().optional(),
});
type Auth = z.infer<typeof AuthSchema>;
type Json = Record<string, unknown>;
class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly clear = false) { super(message); }
}
const record = (value: unknown): Json => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
function numeric(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string' || value === '') return;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}
function configuration(env: Env): string[] {
  return [
    !env.GOOGLE_HEALTH_CLIENT_ID?.trim() && 'GOOGLE_HEALTH_CLIENT_ID',
    !env.GOOGLE_HEALTH_CLIENT_SECRET?.trim() && 'GOOGLE_HEALTH_CLIENT_SECRET',
    !validCookieKey(env.HEALTH_COOKIE_KEY) && 'HEALTH_COOKIE_KEY',
  ].filter((value): value is string => !!value);
}
function headers(cookies: string[] = []) {
  const result = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Vary': 'Cookie, Origin',
  });
  cookies.forEach(value => result.append('Set-Cookie', value));
  return result;
}
function json(value: unknown, status = 200, cookies: string[] = []) {
  return new Response(JSON.stringify(value), { status, headers: headers(cookies) });
}
function redirect(origin: string, outcome: string, cookies: string[] = []) {
  const result = headers(cookies);
  result.set('Location', `${origin}/?health=${outcome}`);
  return new Response(null, { status: 303, headers: result });
}
function clearCookies() {
  return [cookie(SESSION_COOKIE, '', 0), cookie(FLOW_COOKIE, '', 0)];
}
function granted(value: unknown, fallback: string[] = []): string[] {
  const scopes = text(value)?.split(' ') ?? fallback;
  return [...new Set(scopes.filter(scope => (HEALTH_SCOPES as readonly string[]).includes(scope)))];
}
async function authCookie(auth: Auth, env: Env): Promise<string> {
  const expiresAt = Math.min(auth.expiresAt, auth.refreshExpiresAt ?? Infinity);
  return cookie(SESSION_COOKIE, await seal(auth, env.HEALTH_COOKIE_KEY!, 'session'), (expiresAt - Date.now()) / 1000);
}
async function readAuth(request: Request, env: Env): Promise<Auth | undefined> {
  if (!validCookieKey(env.HEALTH_COOKIE_KEY)) return;
  const auth = await unseal(readCookie(request, SESSION_COOKIE), env.HEALTH_COOKIE_KEY, 'session', AuthSchema);
  if (!auth || auth.expiresAt <= Date.now() || (auth.refreshExpiresAt ?? Infinity) <= Date.now()) return;
  return auth;
}
async function fetchJson(url: string, init?: RequestInit): Promise<{ response: Response; data: Json }> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
  catch { throw new ApiError(503, 'provider_unavailable', 'Google Health could not be reached. Try again after syncing your Fitbit.'); }
  let data: Json;
  try { data = record(await response.json()); }
  catch { throw new ApiError(502, 'provider_response', 'Google Health returned an unreadable response. Try again later.'); }
  return { response, data };
}
async function exchange(env: Env, parameters: Record<string, string>) {
  const { response, data } = await fetchJson(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_HEALTH_CLIENT_ID!.trim(), client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET!.trim(), ...parameters }),
  });
  if (!response.ok) {
    if (data.error === 'invalid_grant') throw new ApiError(401, 'reconnect_required', 'Your Google connection expired or was revoked. Connect again.', true);
    throw new ApiError(503, 'oauth_configuration', 'Google authorization failed. Check the OAuth client settings in Cloudflare.');
  }
  if (!text(data.access_token)) throw new ApiError(502, 'provider_response', 'Google did not return an access token.');
  return data;
}
async function google(accessToken: string, path: string, init?: RequestInit): Promise<Json> {
  const { response, data } = await fetchJson(`${GOOGLE_API}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (response.ok) return data;
  const details = record(data.error).details;
  const reasons = Array.isArray(details) ? details.map(detail => record(detail).reason) : [];
  if (reasons.includes('ACCOUNT_NOT_LINKED')) throw new ApiError(409, 'account_not_linked', 'Link your Fitbit account in the Google Health mobile app, then connect again.');
  if (reasons.includes('SERVICE_DISABLED')) throw new ApiError(503, 'api_disabled', 'Enable Google Health API in the Google Cloud project that owns this OAuth client.');
  if (response.status === 401) throw new ApiError(401, 'reconnect_required', 'Your Google connection is no longer authorized. Connect again.', true);
  if (response.status === 403) throw new ApiError(403, 'permissions_required', 'Google did not grant access to this data. Reconnect and review the requested permissions.');
  if (response.status === 404) throw new ApiError(404, 'workout_not_found', 'This workout is no longer available from Google Health.');
  if (response.status === 429) throw new ApiError(429, 'rate_limited', 'Google Health is rate limiting requests. Try again later.');
  throw new ApiError(502, 'provider_response', 'Google Health could not complete this request. Your saved workouts have not changed.');
}
async function authorize(request: Request, env: Env, cookies: string[]) {
  const current = await readAuth(request, env);
  if (!current) throw new ApiError(401, 'reconnect_required', 'Connect Google Health to fetch your wearable data.', true);
  const token = await exchange(env, { grant_type: 'refresh_token', refresh_token: current.refreshToken });
  const lifetime = numeric(token.refresh_token_expires_in, 1, 366 * 86400);
  const next: Auth = {
    refreshToken: text(token.refresh_token) ?? current.refreshToken,
    scopes: granted(token.scope, current.scopes), expiresAt: Date.now() + MAX_SESSION * 1000,
    refreshExpiresAt: lifetime === undefined ? current.refreshExpiresAt : Date.now() + lifetime * 1000,
  };
  if (!next.scopes.length) throw new ApiError(401, 'reconnect_required', 'Google Health permissions were revoked. Connect again to grant access.', true);
  cookies.push(await authCookie(next, env));
  return { accessToken: token.access_token as string, scopes: next.scopes };
}
async function connect(request: Request, env: Env) {
  const url = new URL(request.url);
  const state = randomToken(), verifier = randomToken();
  const redirectUri = `${url.origin}${HEALTH_CALLBACK}`;
  const flow = await seal({ state, verifier, redirectUri, expiresAt: Date.now() + 600000 }, env.HEALTH_COOKIE_KEY!, 'oauth');
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_HEALTH_CLIENT_ID!.trim(), redirect_uri: redirectUri, response_type: 'code',
    scope: HEALTH_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account',
    state, code_challenge: await challenge(verifier), code_challenge_method: 'S256',
  }).toString();
  const result = headers([cookie(FLOW_COOKIE, flow, 600)]);
  result.set('Location', authorization.href);
  return new Response(null, { status: 302, headers: result });
}
async function callback(request: Request, env: Env) {
  const url = new URL(request.url);
  const expired = [cookie(FLOW_COOKIE, '', 0)];
  const flow = await unseal(readCookie(request, FLOW_COOKIE), env.HEALTH_COOKIE_KEY!, 'oauth', FlowSchema);
  const state = url.searchParams.get('state') ?? '';
  if (!flow || flow.expiresAt <= Date.now() || flow.redirectUri !== `${url.origin}${HEALTH_CALLBACK}` || !sameToken(flow.state, state)) return redirect(url.origin, 'state', expired);
  if (url.searchParams.has('error')) return redirect(url.origin, 'denied', expired);
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) return redirect(url.origin, 'failed', expired);
  try {
    const token = await exchange(env, { code, grant_type: 'authorization_code', redirect_uri: flow.redirectUri, code_verifier: flow.verifier });
    const scopes = granted(token.scope, [...HEALTH_SCOPES]);
    if (!scopes.length) return redirect(url.origin, 'permissions', expired);
    const identity = await google(token.access_token as string, 'identity');
    if (!text(identity.healthUserId)) throw new ApiError(409, 'account_not_linked', 'Link your Google account to Google Health first.');
    const refreshToken = text(token.refresh_token);
    if (!refreshToken) return redirect(url.origin, 'failed', expired);
    const lifetime = numeric(token.refresh_token_expires_in, 1, 366 * 86400);
    const auth: Auth = {
      refreshToken, scopes, expiresAt: Date.now() + MAX_SESSION * 1000,
      refreshExpiresAt: lifetime === undefined ? undefined : Date.now() + lifetime * 1000,
    };
    return redirect(url.origin, 'connected', [...expired, await authCookie(auth, env)]);
  } catch (error) {
    return redirect(url.origin, error instanceof ApiError && error.code === 'account_not_linked' ? 'unlinked' : 'failed', expired);
  }
}
async function readBody(request: Request): Promise<Json> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json') throw new ApiError(415, 'content_type', 'Send a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid_request', 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new ApiError(413, 'request_too_large', 'This request is too large.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => { buffer.set(chunk, offset); offset += chunk.length; });
  try { return record(JSON.parse(new TextDecoder().decode(buffer))); }
  catch { throw new ApiError(400, 'invalid_request', 'The request contains invalid JSON.'); }
}
function interval(start: unknown, end: unknown, maxSeconds: number) {
  const schema = z.string().datetime({ offset: true });
  const a = schema.safeParse(start), b = schema.safeParse(end);
  if (!a.success || !b.success) throw new ApiError(400, 'invalid_range', 'Choose a valid date or workout.');
  const seconds = (Date.parse(b.data) - Date.parse(a.data)) / 1000;
  if (seconds < 1 || seconds > maxSeconds) throw new ApiError(400, 'invalid_range', 'The requested time range is too large or invalid.');
  return { startTime: a.data, endTime: b.data, seconds };
}
async function rollup(token: string, type: 'steps' | 'heart-rate', range: ReturnType<typeof interval>) {
  const data = await google(token, `dataTypes/${type}/dataPoints:rollUp`, {
    method: 'POST', body: JSON.stringify({
      range: { startTime: range.startTime, endTime: range.endTime }, windowSize: `${range.seconds}s`,
      pageSize: 1, dataSourceFamily: WEARABLES,
    }),
  });
  if (data.nextPageToken) throw new ApiError(502, 'provider_response', 'Google returned an incomplete summary. Try again later.');
  const rows = Array.isArray(data.rollupDataPoints) ? data.rollupDataPoints : [];
  return record(rows[0]);
}
async function summaries(token: string, scopes: string[], range: ReturnType<typeof interval>) {
  const warnings: string[] = [];
  const read = async (type: 'steps' | 'heart-rate', scope: string): Promise<Json> => {
    if (!scopes.includes(scope)) { warnings.push(`${type === 'steps' ? 'Activity' : 'Heart-rate'} permission was not granted.`); return {}; }
    try { return await rollup(token, type, range); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) { warnings.push(error.message); return {}; }
      throw error;
    }
  };
  const [stepsRow, heartRow] = await Promise.all([read('steps', ACTIVITY_SCOPE), read('heart-rate', HEART_SCOPE)]);
  const steps = numeric(record(stepsRow.steps).countSum, 0, 100000);
  const heart = record(heartRow.heartRate);
  const averageHeartRate = numeric(heart.beatsPerMinuteAvg, 25, 250);
  let maxHeartRate = numeric(heart.beatsPerMinuteMax, 25, 250);
  if (averageHeartRate !== undefined && maxHeartRate !== undefined && maxHeartRate < averageHeartRate) maxHeartRate = undefined;
  return { steps: steps !== undefined && Number.isInteger(steps) ? steps : undefined, averageHeartRate, maxHeartRate, warnings };
}
function workoutFrom(point: Json): HealthWorkout | undefined {
  const exercise = record(point.exercise), time = record(exercise.interval);
  const name = text(point.name) ?? text(point.dataPointName);
  const id = name?.split('/').at(-1);
  if (!id || !/^[A-Za-z0-9_.~-]{1,300}$/.test(id)) return;
  const duration = text(exercise.activeDuration);
  const activeSeconds = duration && /^\d+(\.\d+)?s$/.test(duration) ? Number(duration.slice(0, -1)) : undefined;
  const device = record(record(point.dataSource).device);
  const result = HealthWorkoutSchema.safeParse({
    id, name: (text(exercise.displayName) || text(exercise.exerciseType)?.replace(/_/g, ' ') || 'Recorded workout').slice(0, 200),
    type: (text(exercise.exerciseType) ?? 'WORKOUT').slice(0, 100),
    startTime: time.startTime, endTime: time.endTime, activeSeconds,
    device: text(device.displayName)?.slice(0, 200),
  });
  return result.success && Date.parse(result.data.endTime) > Date.parse(result.data.startTime) ? result.data : undefined;
}
async function listWorkouts(token: string, day: string) {
  const end = new Date(`${day}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const filter = `exercise.interval.civil_start_time >= "${day}" AND exercise.interval.civil_start_time < "${end.toISOString().slice(0, 10)}"`;
  const workouts = new Map<string, HealthWorkout>();
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ filter, pageSize: '25', dataSourceFamily: WEARABLES, ...(pageToken ? { pageToken } : {}) });
    const data = await google(token, `dataTypes/exercise/dataPoints?${query}`);
    for (const point of Array.isArray(data.dataPoints) ? data.dataPoints : []) {
      const workout = workoutFrom(record(point));
      if (workout) workouts.set(workout.id, workout);
    }
    pageToken = text(data.nextPageToken) ?? '';
    if (!pageToken) break;
  }
  return { workouts: [...workouts.values()], truncated: !!pageToken };
}
async function workoutMetrics(token: string, scopes: string[], id: string) {
  const point = await google(token, `dataTypes/exercise/dataPoints/${encodeURIComponent(id)}`);
  const workout = workoutFrom(point);
  if (!workout) throw new ApiError(502, 'provider_response', 'This workout has no usable time interval.');
  const range = interval(workout.startTime, workout.endTime, 86400);
  const measured = await summaries(token, scopes, range);
  const summary = record(record(point.exercise).metricsSummary);
  const averageHeartRate = scopes.includes(HEART_SCOPE) ? numeric(summary.averageHeartRateBeatsPerMinute, 25, 250) ?? measured.averageHeartRate : undefined;
  const steps = scopes.includes(ACTIVITY_SCOPE) ? numeric(summary.steps, 0, 100000) ?? measured.steps : undefined;
  const maxHeartRate = measured.maxHeartRate !== undefined && (averageHeartRate === undefined || measured.maxHeartRate >= averageHeartRate) ? measured.maxHeartRate : undefined;
  const metrics = MetricsSchema.parse({
    source: 'google-health', averageHeartRate, maxHeartRate,
    steps: steps !== undefined && Number.isInteger(steps) ? steps : undefined,
    providerWorkoutId: workout.id, providerStartTime: workout.startTime, providerEndTime: workout.endTime, syncedAt: Date.now(),
  });
  return { workout, metrics, warnings: measured.warnings };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!url.pathname.startsWith('/api/health/')) return json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
    const cookies: string[] = [];
    try {
      if (url.pathname === '/api/health/status' && request.method === 'GET') {
        const missingConfiguration = configuration(env);
        const auth = missingConfiguration.length ? undefined : await readAuth(request, env);
        return json({ configured: !missingConfiguration.length, connected: !!auth, scopes: auth?.scopes ?? [], redirectUri: `${url.origin}${HEALTH_CALLBACK}`, missingConfiguration });
      }
      if (configuration(env).length) throw new ApiError(503, 'not_configured', 'Google Health needs OAuth credentials and an encryption key in Cloudflare settings.');
      if (url.pathname === '/api/health/connect' && request.method === 'GET') return await connect(request, env);
      if (url.pathname === HEALTH_CALLBACK && request.method === 'GET') return await callback(request, env);
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.method === 'POST' && request.headers.get('Origin') !== url.origin) throw new ApiError(403, 'origin_required', 'Open this action from FORM on the same website.');
      if (url.pathname === '/api/health/disconnect' && request.method === 'POST') {
        const auth = await readAuth(request, env);
        let revoked = true;
        if (auth) {
          try {
            const result = await fetch('https://oauth2.googleapis.com/revoke', {
              method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: auth.refreshToken }), signal: AbortSignal.timeout(15000), redirect: 'error',
            });
            revoked = result.ok;
          } catch { revoked = false; }
        }
        return json({ disconnected: true, revoked }, 200, clearCookies());
      }
      if (url.pathname === '/api/health/overview' && request.method === 'POST') {
        const body = await readBody(request);
        const parsed = DaySchema.safeParse(body.day);
        if (!parsed.success) throw new ApiError(400, 'invalid_date', 'Choose a valid date.');
        const range = interval(body.startTime, body.endTime, 27 * 3600);
        const auth = await authorize(request, env, cookies);
        const list = async () => {
          if (!auth.scopes.includes(ACTIVITY_SCOPE)) return { workouts: [], truncated: false };
          try { return await listWorkouts(auth.accessToken, parsed.data); }
          catch (error) {
            if (error instanceof ApiError && error.status === 403) return { workouts: [], truncated: false };
            throw error;
          }
        };
        const [summary, workouts] = await Promise.all([summaries(auth.accessToken, auth.scopes, range), list()]);
        return json({ summary, ...workouts }, 200, cookies);
      }
      if (url.pathname === '/api/health/workout' && request.method === 'POST') {
        const body = await readBody(request);
        const id = text(body.id);
        if (!id || !/^[A-Za-z0-9_.~-]{1,300}$/.test(id)) throw new ApiError(400, 'invalid_workout', 'Choose a recorded workout.');
        const auth = await authorize(request, env, cookies);
        if (!auth.scopes.includes(ACTIVITY_SCOPE)) throw new ApiError(403, 'permissions_required', 'Grant activity access to import a workout.');
        return json(await workoutMetrics(auth.accessToken, auth.scopes, id), 200, cookies);
      }
      return json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(500, 'request_failed', 'The connection could not complete this request. Your saved workouts have not changed.');
      return json({ error: { code: failure.code, message: failure.message } }, failure.status, [...cookies, ...(failure.clear ? clearCookies() : [])]);
    }
  },
};
