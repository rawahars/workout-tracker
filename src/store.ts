import { useSyncExternalStore } from 'react';
import { State, StateSchema } from './model';
import { seedState } from './seed';
import { readSnapshot, writeSnapshot } from './platform';

let state: State | undefined;
let bootError: string | undefined;
let bootPromise: Promise<void> | undefined;
let pending: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

async function openStore(): Promise<void> {
  try {
    const raw = await readSnapshot();
    let loaded: State;
    if (raw === null) {
      if (await readSnapshot(true) !== null) {
        throw new Error('The current save is missing. Recover the previous save or import a backup.');
      }
      loaded = seedState();
      await writeSnapshot(JSON.stringify(loaded));
    } else {
      try { loaded = StateSchema.parse(JSON.parse(raw)); }
      catch { throw new Error('Your saved data is invalid. Recover the previous save or import a backup.'); }
    }
    state = loaded;
    bootError = undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Storage is unavailable.';
    bootError = `${reason} Your saved data has not been overwritten.`;
  }
}

export function boot(): Promise<void> {
  return bootPromise ??= openStore();
}
export const bootFailure = () => bootError;
export function getState(): State {
  if (!state) throw new Error('Storage has not been opened.');
  return state;
}

function enqueue(operation: () => Promise<void>): Promise<void> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

async function persist(next: State): Promise<void> {
  await writeSnapshot(JSON.stringify(next));
  state = next;
  bootError = undefined;
  listeners.forEach(listener => listener());
}

export function commit(next: State | ((current: State) => State)): Promise<void> {
  return enqueue(async () => {
    await boot();
    // A failed save must not leak mutations made by an updater.
    const updated = typeof next === 'function' ? next(StateSchema.parse(getState())) : next;
    await persist(StateSchema.parse(updated));
  });
}
export async function restoreState(next: State): Promise<void> {
  await commit(StateSchema.parse(next));
}
export function useStore() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getState, getState);
}
export function recoverPrevious(): Promise<void> {
  return enqueue(async () => {
    await boot();
    const previous = await readSnapshot(true);
    if (previous === null) throw new Error('No recovery snapshot is available. Import a backup instead.');
    await persist(StateSchema.parse(JSON.parse(previous)));
  });
}
