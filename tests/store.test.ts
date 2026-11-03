import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedState } from '../src/seed';
import type { State } from '../src/model';

const storage = vi.hoisted(() => ({
  current: null as string | null,
  previous: null as string | null,
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../src/platform', () => ({
  readSnapshot: (previous = false) => storage.read(previous),
  writeSnapshot: (value: string) => storage.write(value),
}));

beforeEach(() => {
  vi.resetModules();
  storage.current = null;
  storage.previous = null;
  storage.read.mockReset().mockImplementation(async (previous: boolean) => previous ? storage.previous : storage.current);
  storage.write.mockReset().mockImplementation(async (value: string) => {
    storage.previous = storage.current;
    storage.current = value;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('does not acknowledge a pending or failed durable write and allows a later retry', async () => {
  const { boot, commit, getState } = await import('../src/store');
  await boot();
  const original = getState();
  const saving = deferred();
  storage.write.mockImplementationOnce(() => saving.promise);
  const first = commit(s => ({ ...s, settings: { ...s.settings, weeklyGoal: 6 } }));
  const failure = expect(first).rejects.toThrow('Disk full');
  await vi.waitFor(() => expect(storage.write).toHaveBeenCalledTimes(2));
  expect(getState()).toBe(original);
  saving.reject(new Error('Disk full'));
  await failure;
  expect(getState()).toBe(original);
  expect(JSON.parse(storage.current!).settings.weeklyGoal).toBe(original.settings.weeklyGoal);

  await commit(s => ({ ...s, settings: { ...s.settings, weeklyGoal: 6 } }));
  expect(getState().settings.weeklyGoal).toBe(6);
  expect(JSON.parse(storage.current!).settings.weeklyGoal).toBe(6);
});

it('serializes rapid functional commits against the latest acknowledged state', async () => {
  const { boot, commit, getState } = await import('../src/store');
  await boot();
  const original = getState().settings.weeklyGoal;
  const saving = deferred();
  storage.write.mockImplementationOnce(async (value: string) => {
    await saving.promise;
    storage.previous = storage.current;
    storage.current = value;
  });
  const seen: number[] = [];
  const increment = (s: State): State => {
    seen.push(s.settings.weeklyGoal);
    return { ...s, settings: { ...s.settings, weeklyGoal: s.settings.weeklyGoal + 1 } };
  };
  const first = commit(increment);
  const second = commit(increment);
  await vi.waitFor(() => expect(storage.write).toHaveBeenCalledTimes(2));
  expect(seen).toEqual([original]);
  expect(getState().settings.weeklyGoal).toBe(original);
  saving.resolve();
  await Promise.all([first, second]);
  expect(seen).toEqual([original, original + 1]);
  expect(getState().settings.weeklyGoal).toBe(original + 2);
  expect(JSON.parse(storage.previous!).settings.weeklyGoal).toBe(original + 1);
  expect(JSON.parse(storage.current!).settings.weeklyGoal).toBe(original + 2);
});

it('shares concurrent boot and acknowledges the seed only after it is durable', async () => {
  const { boot, bootFailure, getState } = await import('../src/store');
  const saving = deferred();
  storage.write.mockImplementationOnce(async (value: string) => { await saving.promise; storage.current = value; });
  const first = boot();
  expect(boot()).toBe(first);
  await vi.waitFor(() => expect(storage.write).toHaveBeenCalledTimes(1));
  expect(() => getState()).toThrow('Storage has not been opened');
  saving.resolve();
  await first;
  expect(bootFailure()).toBeUndefined();
  expect(getState().schemaVersion).toBe(1);
  await boot();
  expect(storage.read).toHaveBeenCalledTimes(2);
  expect(storage.write).toHaveBeenCalledTimes(1);
});

it.each(['', '{not json', JSON.stringify({ schemaVersion: 999 })])('preserves invalid saved data without seeding (%j)', async raw => {
  storage.current = raw;
  const { boot, bootFailure, getState, commit } = await import('../src/store');
  await boot();
  expect(bootFailure()).toContain('has not been overwritten');
  expect(() => getState()).toThrow();
  await expect(commit(s => s)).rejects.toThrow('Storage has not been opened');
  expect(storage.write).not.toHaveBeenCalled();
  expect(storage.current).toBe(raw);
});

it('does not seed when storage cannot be read or the seed cannot be saved', async () => {
  const { boot, bootFailure, getState } = await import('../src/store');
  storage.read.mockRejectedValueOnce(new Error('Storage unavailable'));
  await boot();
  expect(bootFailure()).toContain('Storage unavailable');
  expect(storage.write).not.toHaveBeenCalled();
  expect(() => getState()).toThrow();

  vi.resetModules();
  const retry = await import('../src/store');
  storage.write.mockRejectedValueOnce(new Error('Disk full'));
  await retry.boot();
  expect(retry.bootFailure()).toContain('Disk full');
  expect(() => retry.getState()).toThrow();
  expect(storage.current).toBeNull();
});

it('opens an existing valid snapshot without writing another snapshot', async () => {
  storage.current = JSON.stringify(seedState());
  const { boot, bootFailure, getState } = await import('../src/store');
  await boot();
  expect(bootFailure()).toBeUndefined();
  expect(getState()).toEqual(seedState());
  expect(storage.write).not.toHaveBeenCalled();
});

it('can explicitly replace invalid data after boot fails, but rejects invalid replacements', async () => {
  storage.current = 'unreadable original';
  const { boot, bootFailure, restoreState, commit, getState } = await import('../src/store');
  await boot();
  await expect(restoreState({ ...seedState(), schemaVersion: 999 } as unknown as State)).rejects.toThrow();
  expect(storage.write).not.toHaveBeenCalled();
  expect(storage.current).toBe('unreadable original');

  storage.write.mockRejectedValueOnce(new Error('Disk full'));
  await expect(restoreState(seedState())).rejects.toThrow('Disk full');
  expect(() => getState()).toThrow();
  expect(storage.current).toBe('unreadable original');
  expect(bootFailure()).toBeDefined();

  await commit(seedState());
  expect(getState()).toEqual(seedState());
  expect(bootFailure()).toBeUndefined();
  expect(storage.previous).toBe('unreadable original');
});

it('preserves previous-only data for explicit recovery instead of seeding', async () => {
  storage.previous = JSON.stringify(seedState());
  const { boot, bootFailure, recoverPrevious, getState } = await import('../src/store');
  await boot();
  expect(bootFailure()).toContain('Recover the previous save');
  expect(storage.write).not.toHaveBeenCalled();
  await recoverPrevious();
  expect(bootFailure()).toBeUndefined();
  expect(getState()).toEqual(seedState());
});

it('isolates an updater mutation when its save fails', async () => {
  const { boot, commit, getState } = await import('../src/store');
  await boot();
  const original = getState();
  const goal = original.settings.weeklyGoal;
  storage.write.mockRejectedValueOnce(new Error('Disk full'));
  await expect(commit(s => { s.settings.weeklyGoal = 6; return s; })).rejects.toThrow('Disk full');
  expect(getState()).toBe(original);
  expect(getState().settings.weeklyGoal).toBe(goal);
});

it('shares a backup file when supported and treats share cancellation as a no-op', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { canShare: () => true, share });
  const { exportText } = await import('../src/platform.web');
  await exportText('{"backup":true}', 'form-backup.json');
  const file = share.mock.calls[0]![0].files[0] as File;
  expect(file.name).toBe('form-backup.json');
  expect(await file.text()).toBe('{"backup":true}');
  share.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
  await expect(exportText('{}', 'form-backup.json')).resolves.toBeUndefined();
  share.mockRejectedValueOnce(new Error('Sharing failed'));
  await expect(exportText('{}', 'form-backup.json')).rejects.toThrow('Sharing failed');
});

it('falls back to downloading a backup when file sharing is unsupported', async () => {
  vi.useFakeTimers();
  const link = { href: '', download: '', click: vi.fn() };
  const share = vi.fn();
  vi.stubGlobal('navigator', { canShare: () => false, share });
  vi.stubGlobal('document', { createElement: () => link });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const { exportText } = await import('../src/platform.web');
  await exportText('{}', 'form-backup.json');
  expect(share).not.toHaveBeenCalled();
  expect(link.download).toBe('form-backup.json');
  expect(link.click).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:backup');
});

it('rejects oversized or unreadable chosen files instead of treating them as cancellation', async () => {
  const file = { size: 60 * 1024 * 1024 + 1, text: vi.fn() };
  const input = {
    files: [file],
    onchange: undefined as (() => void) | undefined,
    click: () => queueMicrotask(() => input.onchange?.()),
  };
  vi.stubGlobal('document', { createElement: () => input });
  const { chooseTextFile } = await import('../src/platform.web');
  await expect(chooseTextFile()).rejects.toThrow('smaller than 60 MB');
  expect(file.text).not.toHaveBeenCalled();
  file.size = 1;
  file.text.mockRejectedValueOnce(new Error('Not readable'));
  await expect(chooseTextFile()).rejects.toThrow('Could not read this file');
  file.text.mockResolvedValueOnce('{"backup":true}');
  await expect(chooseTextFile()).resolves.toBe('{"backup":true}');
});
