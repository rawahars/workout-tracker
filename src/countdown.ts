import { Countdown, CountdownSchema } from './model';
import { uid } from './domain';

export function makeCountdown(seconds: number, now = Date.now()): Countdown {
  return CountdownSchema.parse({ id: uid(), durationSeconds: seconds, remainingMs: seconds * 1000, endsAt: now + seconds * 1000, status: 'running' });
}
export function countdownRemaining(timer: Countdown, now = Date.now()): number {
  return timer.status === 'running' ? Math.max(0, Math.min(timer.remainingMs, timer.endsAt! - now)) : timer.remainingMs;
}
export function pauseCountdown(timer: Countdown, now = Date.now()): Countdown {
  const remainingMs = countdownRemaining(timer, now);
  if (timer.status !== 'running' || remainingMs === 0) return timer;
  return { ...timer, remainingMs, endsAt: undefined, status: 'paused' };
}
export function resumeCountdown(timer: Countdown, now = Date.now()): Countdown {
  return timer.status === 'paused' ? { ...timer, endsAt: now + timer.remainingMs, status: 'running' } : timer;
}
