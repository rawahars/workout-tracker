import { describe, expect, it } from 'vitest';
import { CountdownSchema, StateSchema } from '../src/model';
import { countdownRemaining, makeCountdown, pauseCountdown, resumeCountdown } from '../src/countdown';
import { finishSession, groupWorkouts, startSession } from '../src/domain';
import { seedState } from '../src/seed';

function session(id: string, start: number, end: number, day = '2026-11-03') {
  const state = seedState();
  const active = startSession(state, state.workouts[0], day, start);
  active.active!.exercises[0]!.sets[0]!.done = true;
  return { ...finishSession(active, end).sessions[0]!, id };
}
describe('workout countdown', () => {
  it('uses an absolute deadline and caps display time when a clock sample predates the start', () => {
    const timer = makeCountdown(60, 100000);
    expect(countdownRemaining(timer, 130000)).toBe(30000);
    expect(countdownRemaining(timer, 0)).toBe(60000);
    expect(countdownRemaining(timer, 200000)).toBe(0);
    expect(countdownRemaining(CountdownSchema.parse(JSON.parse(JSON.stringify(timer))), 145000)).toBe(15000);
  });
  it('pauses without drifting and resumes from the remaining duration', () => {
    const paused = pauseCountdown(makeCountdown(60, 100000), 125000);
    expect(paused.status).toBe('paused');
    expect(countdownRemaining(paused, 300000)).toBe(35000);
    const resumed = resumeCountdown(paused, 400000);
    expect(resumed.endsAt).toBe(435000);
    expect(countdownRemaining(resumed, 420000)).toBe(15000);
  });
  it('rejects invalid durations and leaves expired running timers available for alarm completion', () => {
    expect(() => makeCountdown(0)).toThrow();
    expect(() => makeCountdown(86401)).toThrow();
    expect(() => makeCountdown(1.5)).toThrow();
    const expired = makeCountdown(1, 1000);
    expect(pauseCountdown(expired, 3000)).toBe(expired);
  });
  it('persists active timers but removes them from completed workout logs', () => {
    const initial = seedState();
    const state = startSession(initial, initial.workouts[0], undefined, 1000);
    state.active!.countdown = makeCountdown(90, 1000);
    state.active!.exercises[0]!.sets[0]!.done = true;
    expect(StateSchema.parse(JSON.parse(JSON.stringify(state))).active!.countdown!.durationSeconds).toBe(90);
    expect(finishSession(state, 2000).sessions[0]!.countdown).toBeUndefined();
  });
});
describe('grouped workout visits', () => {
  it('groups same-day sessions using the gap between end and next start, without mutating logs', () => {
    const a = session('a', 0, 3600000);
    const b = session('b', 3600000 + 120 * 60000, 3600000 + 121 * 60000);
    const c = session('c', b.endedAt! + 120 * 60000 + 1, b.endedAt! + 121 * 60000);
    const logs = [c, b, a];
    const before = JSON.stringify(logs);
    expect(groupWorkouts(logs).map(group => group.sessions.map(value => value.id))).toEqual([['a', 'b'], ['c']]);
    expect(JSON.stringify(logs)).toBe(before);
  });
  it('keeps different days separate and handles nested overlapping intervals', () => {
    const long = session('long', 0, 10 * 3600000);
    const overlap = session('overlap', 3600000, 2 * 3600000);
    const nearby = session('nearby', 11 * 3600000, 12 * 3600000);
    const nextDay = session('tomorrow', 0, 3600000, '2026-11-04');
    expect(groupWorkouts([nextDay, overlap, nearby, long]).map(group => group.sessions.map(value => value.id))).toEqual([['long', 'overlap', 'nearby'], ['tomorrow']]);
  });
});
