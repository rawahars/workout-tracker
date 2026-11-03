import { z } from 'zod';
import { DaySchema } from './model';
import { HealthOverviewSchema, HealthStatusSchema, HealthWorkoutMetricsSchema } from './health-contract';

export class HealthClientError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
let connectionError: string | undefined;
export const healthConnectionError = () => connectionError;
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/health/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch { throw new HealthClientError('offline', 'Connect to the internet to sync Google Health. Your logged workouts are still available offline.'); }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new HealthClientError('not_configured', 'Google Health requires the Cloudflare Worker deployment, not a static-only preview.'); }
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(data);
    throw new HealthClientError(error.success ? error.data.error.code : 'request_failed', error.success ? error.data.error.message : 'Google Health could not complete this request.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HealthClientError('invalid_response', 'Google Health returned data the app could not read. No saved workout was changed.');
  return parsed.data;
}
export const healthStatus = () => request('status', HealthStatusSchema);
export function connectHealth() {
  if (typeof window === 'undefined') throw new HealthClientError('web_only', 'Connect from the installed web app.');
  window.location.assign('/api/health/connect');
}
export const disconnectHealth = () => request('disconnect', z.object({ disconnected: z.boolean(), revoked: z.boolean() }), {});
export function healthOverview(day: string) {
  DaySchema.parse(day);
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return request('overview', HealthOverviewSchema, { day, startTime: start.toISOString(), endTime: end.toISOString() });
}
export const healthWorkout = (id: string) => request('workout', HealthWorkoutMetricsSchema, { id });
export function healthResultMessage(): string | undefined {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const result = url.searchParams.get('health_error') ?? url.searchParams.get('health');
  if (!result) return;
  url.searchParams.delete('health');
  url.searchParams.delete('health_error');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const messages: Record<string, string> = {
    connected: 'Google Health connected. Open Google Health in Settings to sync.',
    denied: 'Google Health permission was not granted. No workout data was changed.',
    unlinked: 'Link your Fitbit account in the Google Health mobile app, then connect again.',
    permissions: 'Grant at least one requested Google Health permission to connect.',
    state: 'The Google sign-in attempt expired or could not be verified. Please try again.',
    failed: 'Google Health could not connect. Check the OAuth setup and try again.',
    oauth_client: 'Google rejected the app credentials (OAUTH_CLIENT_REJECTED). Re-copy the client ID and actual client secret from the same Google OAuth Web application into Cloudflare runtime secrets. Do not use the secret ID, masked text, surrounding quotes or a JSON document.',
    oauth_redirect: 'The callback URI does not match (OAUTH_REDIRECT_MISMATCH). Register this exact site origin followed by /api/health/callback in the Google OAuth Web client.',
    oauth_configuration: 'Google rejected the token exchange (OAUTH_CONFIGURATION). Check the Web application client settings and try a fresh Connect attempt.',
    authorization_code: 'Google rejected or did not return a usable authorization code (AUTHORIZATION_CODE_REJECTED). Start a fresh Connect attempt; do not reload the callback page.',
    api_disabled: 'Google Health API is not enabled for this OAuth client (HEALTH_API_DISABLED). Enable health.googleapis.com in the same Google Cloud project that owns the client, then retry after it propagates.',
    billing_required: 'Google reports billing is required (BILLING_REQUIRED). Do not enable billing. Leave Health sync disabled and use manual metrics.',
    identity_denied: 'Google accepted sign-in but denied the Health identity check (HEALTH_IDENTITY_DENIED). Confirm this account is linked or migrated to Google Health, and grant the requested read permissions.',
    identity_missing: 'Google did not return a Health identity (HEALTH_IDENTITY_MISSING). Open the Fitbit / Google Health mobile app and confirm that it is linked to the Google account you selected.',
    offline_access: 'Google did not grant offline access (OFFLINE_ACCESS_MISSING). Remove FORM from your Google Account connected apps, then connect again and approve the requested permissions.',
    provider_unavailable: 'Google could not be reached during authorization (GOOGLE_UNAVAILABLE). Try connecting again later.',
    rate_limited: 'Google temporarily limited authorization requests (GOOGLE_RATE_LIMITED). Wait before trying again.',
    token_failed: 'Google returned an unexpected authorization response (TOKEN_RESPONSE_FAILED). Try a fresh Connect attempt.',
    identity_failed: 'The Google Health identity check failed (HEALTH_IDENTITY_FAILED). Confirm Google Health API is enabled and your mobile account is linked, then retry.',
    session_failed: 'Google authorized access but FORM could not save the secure connection (SESSION_SAVE_FAILED). Check the server encryption-key setup, without sharing its value.',
  };
  const message = messages[result];
  connectionError = result === 'connected' ? undefined : message;
  return message;
}
