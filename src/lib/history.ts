import { getJson } from "./api";
import { onSwapReset } from "./cache-reset";

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

// A new revision lands on edit — drop the memoised history so it shows up.
onSwapReset(() => cache.clear());

async function loadHistory(slug: string): Promise<Revision[]> {
  const { revisions } = await getJson<{ revisions: Revision[] }>(
    `/history?slug=${encodeURIComponent(slug)}`,
  );
  return revisions;
}

export async function getDiff(
  slug: string,
  base: string,
  head: string,
): Promise<string | null> {
  const { patch } = await getJson<{ patch: string | null }>(
    `/diff?slug=${encodeURIComponent(slug)}&base=${base}&head=${head}`,
  );
  return patch;
}
