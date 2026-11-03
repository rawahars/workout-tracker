import { describe, expect, it } from 'vitest';
import { StateSchema, localDay, validDay } from '../src/model';
import { seedState, upgradeLibrary } from '../src/seed';
import { alternatives, completedSets, finishSession, previousSets, sessionExercise, startSession, validateLoggedSet, volume, weekDays } from '../src/domain';

function state() { return structuredClone(seedState()); }
function completed(day = '2026-11-02') {
  const initial = state();
  const active = startSession(initial, initial.workouts[0], day, 1000, 'foundation');
  const first = active.active!.exercises[0]!;
  first.sets[0] = { ...first.sets[0]!, weight: 10, reps: 12, done: true };
  return finishSession(active, 601000);
}
describe('workout lifecycle', () => {
  it('ships a valid library containing every prescribed movement and shared program references', () => {
    const initial = state();
    expect(StateSchema.safeParse(initial).success).toBe(true);
    expect(initial.exercises.length).toBeGreaterThan(60);
    expect(initial.programs[0]!.slots[0]!.workoutId).toBe(initial.programs[1]!.slots[0]!.workoutId);
  });
  it('caps return-mode sets without adding sets to cardio', () => {
    const initial = state();
    expect(startSession(initial, initial.workouts[0]).active!.exercises.every(e => e.sets.length <= 2)).toBe(true);
    expect(startSession(initial, initial.workouts[2]).active!.exercises[0]!.sets).toHaveLength(1);
    initial.settings.returnMode = false;
    expect(startSession(initial, initial.workouts[0]).active!.exercises[0]!.sets).toHaveLength(3);
  });
  it('snapshots names and prescriptions so editing templates cannot rewrite history', () => {
    const initial = state();
    const active = startSession(initial, initial.workouts[0], '2026-11-02', 1000, 'foundation');
    initial.workouts[0]!.name = 'Renamed';
    initial.exercises[0]!.name = 'Renamed exercise';
    initial.programs[0]!.name = 'Renamed program';
    initial.workouts[0]!.exercises[0]!.min = 99;
    expect(active.active!.name).toBe('Upper body A');
    expect(active.active!.exercises[0]!.name).toBe('Flat dumbbell chest press');
    expect(active.active!.exercises[0]!.target).toBe('8-12 reps');
    expect(active.active!.programName).toBe('The Foundation');
  });
  it('refuses to overwrite an unfinished session', () => {
    const active = startSession(state());
    expect(() => startSession(active)).toThrow('Finish or discard');
  });
  it('requires completed work, excludes unchecked sets and preserves a backdated date', () => {
    const initial = state();
    expect(() => finishSession(startSession(initial), 1000)).toThrow('at least one');
    const result = completed();
    const session = result.sessions[0]!;
    expect(result.active).toBeNull();
    expect(session.day).toBe('2026-11-02');
    expect(session.duration).toBe(600);
    expect(completedSets(session)).toBe(1);
    expect(volume(session)).toBe(120);
    expect(StateSchema.safeParse(result).success).toBe(true);
  });
  it('uses the latest performed day rather than the date a backdated workout was entered', () => {
    const result = completed('2026-11-02');
    const older = completed('2026-10-25').sessions[0]!;
    older.exercises[0]!.sets[0]!.weight = 5;
    result.sessions.push(older);
    expect(previousSets(result, 'db-bench')[0]!.weight).toBe(10);
    const next = sessionExercise(result, result.exercises[0]!);
    expect(next.sets[0]!.weight).toBe(10);
    expect(next.sets[0]!.done).toBe(false);
    expect(next.sets[0]!.id).not.toBe(result.sessions[0]!.exercises[0]!.sets[0]!.id);
  });
  it('logs freestyle with no false association to a scheduled program', () => {
    const result = startSession(state(), undefined, '2026-11-01');
    expect(result.active!.workoutId).toBeUndefined();
    expect(result.active!.programId).toBeUndefined();
    expect(result.active!.exercises).toHaveLength(0);
  });
  it('adds treadmill to existing libraries without changing selected media or workout history', () => {
    const initial = completed();
    initial.exercises = initial.exercises.filter(e => e.id !== 'treadmill');
    initial.exercises[0] = { ...initial.exercises[0]!, image: 'chosen_image', videoId: 'dQw4w9WgXcQ' };
    const history = structuredClone(initial.sessions);
    const upgraded = upgradeLibrary(initial);
    expect(upgraded.exercises.find(e => e.id === 'treadmill')?.mode).toBe('cardio');
    expect(upgraded.exercises[0]!.image).toBe('chosen_image');
    expect(upgraded.exercises[0]!.videoId).toBe('dQw4w9WgXcQ');
    expect(upgraded.sessions).toEqual(history);
    expect(upgradeLibrary(upgraded)).toBe(upgraded);
    const treadmill = sessionExercise(upgraded, upgraded.exercises.find(e => e.id === 'treadmill')!);
    expect(treadmill.sets).toHaveLength(1);
    expect(treadmill.sets[0]!.seconds).toBe(1200);
  });
  it('corrects the confirmed plank pass-through without rewriting renamed custom variations', () => {
    const initial = state();
    const index = initial.exercises.findIndex(e => e.id === 'pass-through');
    initial.exercises[index] = { ...initial.exercises[index]!, name: 'Dumbbell pass-through', muscle: 'Shoulders', pattern: 'Mobility', perSide: false };
    const upgraded = upgradeLibrary(initial);
    expect(upgraded.exercises[index]!.name).toBe('Plank dumbbell pass-through');
    expect(upgraded.exercises[index]!.muscle).toBe('Core');
    initial.exercises[index]!.name = 'My shoulder drill';
    expect(upgradeLibrary(initial).exercises[index]!.name).toBe('My shoulder drill');
  });
  it('validates completed rep and duration sets while allowing zero external load', () => {
    const initial = state();
    const weighted = sessionExercise(initial, initial.exercises[0]!);
    expect(() => validateLoggedSet(weighted, { ...weighted.sets[0]!, weight: 0, reps: 8 })).not.toThrow();
    expect(() => validateLoggedSet(weighted, { ...weighted.sets[0]!, reps: 0 })).toThrow();
    const plank = sessionExercise(initial, initial.exercises.find(e => e.id === 'plank')!);
    expect(() => validateLoggedSet(plank, { ...plank.sets[0]!, seconds: 0 })).toThrow();
  });
  it('limits alternatives to comparable movement and tracking types', () => {
    const initial = state();
    const options = alternatives(initial, initial.exercises[0]!);
    expect(options.some(e => e.id === 'chest-press')).toBe(true);
    expect(options.some(e => e.id === 'push-up')).toBe(false);
    expect(options.some(e => e.id === 'pulldown')).toBe(false);
  });
});
describe('local calendar dates', () => {
  it('round-trips local days and rejects normalized impossible dates', () => {
    expect(localDay(new Date(2026, 10, 3, 0, 5))).toBe('2026-11-03');
    expect(validDay('2026-02-30')).toBe(false);
    expect(validDay('2024-02-29')).toBe(true);
    expect(weekDays(new Date(2026, 10, 1, 12))).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
