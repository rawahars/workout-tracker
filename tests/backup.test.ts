import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../src/seed';
import { StateSchema } from '../src/model';
import { finishSession, startSession } from '../src/domain';
import { createBackup, parseBackup, prepareRestore } from '../src/backup';
const media = vi.hoisted(() => new Map<string, string>());
vi.mock('../src/platform', () => ({
  imageData: async (id: string) => media.get(id),
  saveImage: async (id: string, value: string) => { media.set(id, value); },
}));
const jpeg = 'data:image/jpeg;base64,YWJj';

beforeEach(() => media.clear());
describe('portable backups', () => {
  it('round-trips chosen images, in-progress sets, reusable programs and history without API keys', async () => {
    const initial = structuredClone(seedState());
    initial.exercises[0]!.image = 'test_image';
    media.set('test_image', jpeg);
    const active = startSession(initial, initial.workouts[0], '2026-11-02', 1000);
    active.active!.exercises[0]!.sets[0]!.done = true;
    const withHistory = finishSession(active, 2000);
    const final = startSession(withHistory, withHistory.workouts[1], '2026-11-03', 3000);
    const backup = parseBackup(JSON.stringify(await createBackup(final)));
    const restored = await prepareRestore(backup);
    expect(StateSchema.safeParse(restored).success).toBe(true);
    expect(restored.active!.id).toBe(final.active!.id);
    expect(restored.sessions).toHaveLength(1);
    expect(restored.exercises[0]!.image).not.toBe('test_image');
    expect(media.get(restored.exercises[0]!.image!)).toBe(jpeg);
    expect(JSON.stringify(backup)).not.toContain('youtube-key');
  });
  it('rejects future schemas, malformed JSON, missing images and dangling references before restore', async () => {
    const backup = await createBackup(structuredClone(seedState()));
    expect(() => parseBackup('{')).toThrow('not a valid');
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow();
    const missingImage = structuredClone(backup);
    missingImage.state.exercises[0]!.image = 'missing';
    expect(() => parseBackup(JSON.stringify(missingImage))).toThrow();
    const missingExercise = structuredClone(backup);
    missingExercise.state.workouts[0]!.exercises[0]!.exerciseId = 'absent';
    expect(() => parseBackup(JSON.stringify(missingExercise))).toThrow();
    const duplicate = structuredClone(backup);
    duplicate.state.workouts.push(duplicate.state.workouts[0]!);
    expect(() => parseBackup(JSON.stringify(duplicate))).toThrow();
  });
  it('does not silently export a backup that loses a chosen image', async () => {
    const initial = structuredClone(seedState());
    initial.exercises[0]!.image = 'not_on_disk';
    await expect(createBackup(initial)).rejects.toThrow('missing');
  });
});
