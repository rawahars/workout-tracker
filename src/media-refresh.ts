import { useSyncExternalStore } from 'react';
import { canRefreshMedia, findTutorial, NoTutorialError } from './media';
import { commit, getState } from './store';

type Progress = { running: boolean; completed: number; total: number; updated: number; error?: string };
let progress: Progress = { running: false, completed: 0, total: 0, updated: 0 };
const listeners = new Set<() => void>();
let currentRun: Promise<void> | undefined;
let controller: AbortController | undefined;

function publish(next: Progress) {
  progress = next;
  listeners.forEach(listener => listener());
}
export function useMediaRefresh() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => progress, () => progress);
}
export function cancelMediaRefresh() { controller?.abort(); }
export function refreshExerciseMedia(key: string): Promise<void> {
  if (currentRun) return currentRun;
  if (!key.trim()) return Promise.resolve();
  controller = new AbortController();
  const signal = controller.signal;
  const pending = getState().exercises.filter(canRefreshMedia);
  publish({ running: true, completed: 0, total: pending.length, updated: 0 });
  currentRun = (async () => {
    try {
      for (let index = 0; index < pending.length; index++) {
        if (signal.aborted) break;
        const exercise = getState().exercises.find(e => e.id === pending[index]!.id);
        if (exercise && canRefreshMedia(exercise)) {
          let result: Awaited<ReturnType<typeof findTutorial>>;
          try { result = await findTutorial(exercise, key, signal); }
          catch (error) {
            if (!(error instanceof NoTutorialError)) throw error;
            publish({ ...progress, completed: index + 1, error: `${exercise.name}: ${error.message}` });
            continue;
          }
          if (signal.aborted) break;
          let updated = false;
          await commit(state => ({
            ...state, exercises: state.exercises.map(current => {
              if (current.id !== exercise.id || current.name !== exercise.name || !canRefreshMedia(current)) return current;
              updated = true;
              return { ...current, ...result, videoSource: 'automatic', hideDefaultVideo: false };
            }),
          }));
          if (updated) publish({ ...progress, updated: progress.updated + 1 });
        }
        publish({ ...progress, completed: index + 1 });
      }
    } catch (error) {
      if (!signal.aborted) publish({ ...progress, error: error instanceof Error ? error.message : 'Media refresh could not finish. Your saved media was kept.' });
    } finally {
      publish({ ...progress, running: false });
      controller = undefined;
    }
  })();
  const run = currentRun;
  const clear = () => { if (currentRun === run) currentRun = undefined; };
  void run.then(clear, clear);
  return run;
}
