import { getJson } from "./api";
import { onSwapReset } from "./cache-reset";

export interface Revision {
  sha: string;
  parent: string | null;
  author: string;
  date: string;
  message: string;
}

export interface HistoryPage {
  revisions: Revision[];
  hasMore: boolean;
}

// Memoised per slug so the read view's PageMeta + Infobox share one request.
// Drop a rejected lookup so a transient failure can be retried on the next call.
const cache = new Map<string, Promise<Revision[]>>();

// First page only — used where just the latest revision is needed (PageMeta,
// Infobox). The history view pages explicitly via getHistoryPage.
export function getHistory(slug: string): Promise<Revision[]> {
  let p = cache.get(slug);
  if (!p) {
    p = getHistoryPage(slug, 1)
      .then((r) => r.revisions)
      .catch((e) => {
        cache.delete(slug);
        throw e;
      });
    cache.set(slug, p);
  }
  return p;
}

export async function getHistoryPage(slug: string, page = 1): Promise<HistoryPage> {
  return getJson<HistoryPage>(`/history?slug=${encodeURIComponent(slug)}&page=${page}`);
}

// A new revision lands on edit — drop the memoised history so it shows up.
onSwapReset(() => cache.clear());

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
