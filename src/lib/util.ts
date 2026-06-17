export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
