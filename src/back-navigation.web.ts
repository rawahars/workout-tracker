export interface BackNavigation { sync(): void; dispose(): void }

export function installBackNavigation(frames: () => string[], restoreDepth: (depth: number) => void, render: () => void): BackNavigation {
  const token = `${Date.now()}-${Math.random()}`;
  let browserFrames: string[] = [];
  let traversing = false, scheduled = false, disposed = false;
  const marker = (ids: string[]) => ({ __formNavigation: token, frames: ids });
  window.history.replaceState(marker([]), '', window.location.href);
  function readFrames(value: unknown): string[] {
    if (!value || typeof value !== 'object') return [];
    const state = value as { __formNavigation?: unknown; frames?: unknown };
    return state.__formNavigation === token && Array.isArray(state.frames) && state.frames.every(id => typeof id === 'string') ? state.frames : [];
  }
  function reconcile() {
    scheduled = false;
    if (disposed || traversing) return;
    const desired = frames();
    let common = 0;
    while (common < browserFrames.length && common < desired.length && browserFrames[common] === desired[common]) common++;
    if (desired.length && desired.length === browserFrames.length && common === desired.length - 1) {
      window.history.replaceState(marker(desired), '', window.location.href);
      browserFrames = [...desired];
      render();
      return;
    }
    if (common < browserFrames.length) {
      traversing = true;
      window.history.go(common - browserFrames.length);
      return;
    }
    for (let depth = browserFrames.length + 1; depth <= desired.length; depth++) {
      window.history.pushState(marker(desired.slice(0, depth)), '', window.location.href);
    }
    browserFrames = [...desired];
    render();
  }
  function sync() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(reconcile);
  }
  function pop(event: PopStateEvent) {
    const target = readFrames(event.state), programmatic = traversing;
    traversing = true;
    // Safari restores form state after popstate; render the target only after traversal settles.
    setTimeout(() => {
      if (disposed) return;
      browserFrames = target; traversing = false;
      if (!programmatic) {
        const current = frames();
        if (target.length <= current.length && target.every((id, index) => id === current[index])) restoreDepth(target.length);
        // Closed sheets can contain callbacks to unmounted editors; don't revive stale forward entries.
      }
      reconcile();
    }, 0);
  }
  window.addEventListener('popstate', pop);
  return {
    sync,
    dispose() { disposed = true; window.removeEventListener('popstate', pop); },
  };
}
