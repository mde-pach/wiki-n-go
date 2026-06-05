import { config } from "../config";

export interface Revision {
  sha: string;
  parent: string | null;
  author: string;
  date: string;
  message: string;
}

// Memoised per slug so the read view's PageMeta + Infobox share one request.
// Drop a rejected lookup so a transient failure can be retried on the next call.
const cache = new Map<string, Promise<Revision[]>>();

export function getHistory(slug: string): Promise<Revision[]> {
  let p = cache.get(slug);
  if (!p) {
    p = loadHistory(slug).catch((e) => {
      cache.delete(slug);
      throw e;
    });
    cache.set(slug, p);
  }
  return p;
}

async function loadHistory(slug: string): Promise<Revision[]> {
  const res = await fetch(
    `${config.workerUrl}/history?slug=${encodeURIComponent(slug)}`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Failed to load history (HTTP ${res.status}).`);
  return ((await res.json()) as { revisions: Revision[] }).revisions;
}

export async function getDiff(
  slug: string,
  base: string,
  head: string,
): Promise<string | null> {
  const url = `${config.workerUrl}/diff?slug=${encodeURIComponent(slug)}&base=${base}&head=${head}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load diff (HTTP ${res.status}).`);
  return ((await res.json()) as { patch: string | null }).patch;
}
