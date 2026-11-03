import { z } from 'zod';
import { DaySchema } from './model';
import { HealthOverviewSchema, HealthStatusSchema, HealthWorkoutMetricsSchema } from './health-contract';

export class HealthClientError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
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
  const result = url.searchParams.get('health');
  if (!result) return;
  url.searchParams.delete('health');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const messages: Record<string, string> = {
    connected: 'Google Health connected. Open Google Health in Settings to sync.',
    denied: 'Google Health permission was not granted. No workout data was changed.',
    unlinked: 'Link your Fitbit account in the Google Health mobile app, then connect again.',
    permissions: 'Grant at least one requested Google Health permission to connect.',
    state: 'The Google sign-in attempt expired or could not be verified. Please try again.',
    failed: 'Google Health could not connect. Check the OAuth setup and try again.',
  };
  return messages[result];
}
