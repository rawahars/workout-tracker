export interface BackNavigation { sync(): void; dispose(): void }
export function installBackNavigation(_frames: () => string[], _restoreDepth: (depth: number) => void, render: () => void): BackNavigation {
  return { sync() { render(); }, dispose() {} };
}
