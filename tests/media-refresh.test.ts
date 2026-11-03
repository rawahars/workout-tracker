import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../src/seed';
import { State } from '../src/model';
import { cancelMediaRefresh, refreshExerciseMedia } from '../src/media-refresh';
import { NoTutorialError } from '../src/media';

const mock = vi.hoisted(() => ({ state: undefined as State | undefined, find: vi.fn() }));
vi.mock('../src/store', () => ({
  getState: () => mock.state!,
  commit: async (change: (state: State) => State) => { mock.state = change(mock.state!); },
}));
vi.mock('../src/media', async importOriginal => ({
  ...await importOriginal<typeof import('../src/media')>(),
  findTutorial: mock.find,
}));

const result = { videoId: 'dQw4w9WgXcQ', videoTitle: 'Fresh tutorial', videoFetchedAt: 123 };
beforeEach(() => {
  mock.state = structuredClone(seedState());
  mock.state.exercises = mock.state.exercises.slice(0, 3);
  mock.find.mockReset().mockResolvedValue(result);
});
describe('user-key media refresh', () => {
  it('uses only the supplied key and refreshes automatic media while preserving manual videos and images', async () => {
    mock.state!.exercises[0] = { ...mock.state!.exercises[0]!, image: 'my_photo', videoId: 'abcdefghijk', videoSource: 'automatic' };
    mock.state!.exercises[1] = { ...mock.state!.exercises[1]!, videoId: 'ABCDEFGHIJK', videoSource: 'manual' };
    mock.state!.exercises[2] = { ...mock.state!.exercises[2]!, videoId: '12345678901' };
    await refreshExerciseMedia('user-entered-test-value');
    expect(mock.find).toHaveBeenCalledTimes(1);
    expect(mock.find.mock.calls[0]![1]).toBe('user-entered-test-value');
    expect(mock.state!.exercises[0]!.videoId).toBe(result.videoId);
    expect(mock.state!.exercises[0]!.image).toBe('my_photo');
    expect(mock.state!.exercises[1]!.videoId).toBe('ABCDEFGHIJK');
    expect(mock.state!.exercises[2]!.videoId).toBe('12345678901');
    expect(JSON.stringify(mock.state)).not.toContain('user-entered-test-value');
  });
  it('does not overwrite a manual selection made while a lookup is in flight', async () => {
    mock.find.mockImplementationOnce(async () => {
      mock.state!.exercises[0] = { ...mock.state!.exercises[0]!, videoId: 'ABCDEFGHIJK', videoSource: 'manual' };
      return result;
    });
    await refreshExerciseMedia('test-value');
    expect(mock.state!.exercises[0]!.videoId).toBe('ABCDEFGHIJK');
    expect(mock.state!.exercises[1]!.videoId).toBe(result.videoId);
  });
  it('retains existing media on quota errors and permits retry', async () => {
    mock.find.mockRejectedValueOnce(new Error('Quota exhausted'));
    await refreshExerciseMedia('test-value');
    expect(mock.state!.exercises[0]!.videoId).toBeUndefined();
    await refreshExerciseMedia('test-value');
    expect(mock.state!.exercises.every(e => e.videoId === result.videoId)).toBe(true);
  });
  it('continues refreshing other exercises when one has no search result', async () => {
    mock.find.mockRejectedValueOnce(new NoTutorialError('No matching tutorial'));
    await refreshExerciseMedia('test-value');
    expect(mock.state!.exercises[0]!.videoId).toBeUndefined();
    expect(mock.state!.exercises[1]!.videoId).toBe(result.videoId);
    expect(mock.state!.exercises[2]!.videoId).toBe(result.videoId);
  });
  it('does nothing without a key, deduplicates concurrent runs, and stops safely', async () => {
    await refreshExerciseMedia('');
    expect(mock.find).not.toHaveBeenCalled();
    let resolve!: (value: typeof result) => void;
    mock.find.mockReturnValueOnce(new Promise<typeof result>(finish => { resolve = finish; }));
    const first = refreshExerciseMedia('test-value');
    expect(refreshExerciseMedia('test-value')).toBe(first);
    cancelMediaRefresh();
    resolve(result);
    await first;
    expect(mock.state!.exercises[0]!.videoId).toBeUndefined();
  });
  it('can run again after an empty refresh', async () => {
    mock.state!.exercises.forEach(e => { e.hideDefaultVideo = true; });
    await refreshExerciseMedia('test-value');
    mock.state!.exercises[0]!.hideDefaultVideo = false;
    await refreshExerciseMedia('test-value');
    expect(mock.state!.exercises[0]!.videoId).toBe(result.videoId);
  });
});
