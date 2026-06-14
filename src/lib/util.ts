export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Run work once the browser is idle, so it doesn't compete with first paint or
// hydration. Falls back to a short timeout where requestIdleCallback is absent
// (Safari), with a hard deadline so it never starves on a busy page.
export function deferIdle(fn: () => void): void {
  const ric = (
    globalThis as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 2000 });
  else setTimeout(fn, 200);
}
