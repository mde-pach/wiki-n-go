// Fetch the first reachable source, trying each URL in order; nulls are skipped
// so callers can gate a source (e.g. the Worker) inline. Returns the parsed JSON
// of the first OK response, or null when none respond.
export async function fetchFirstOk<T>(urls: (string | null)[]): Promise<T | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // try the next source
    }
  }
  return null;
}
