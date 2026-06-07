import { getJson } from "./api";
import { type Change, listChanges } from "./changes";

// The curation state for one page's latest revision: enough to drive the
// reviewer toolbar (patrol it, roll it back, jump to the author). Reuses the
// existing Worker surfaces — no new endpoint.
export interface Curation {
  slug: string;
  sha: string | null;
  patrolled: boolean;
  author?: string;
  isAnon?: boolean;
  risk?: number;
  tags: string[];
}

// Build curation state from a change row a caller already has (the New-pages
// queue), so it needs no extra fetch.
export function curationFromChange(slug: string, c: Change): Curation {
  return {
    slug,
    sha: c.sha,
    patrolled: c.patrolled,
    author: c.author,
    isAnon: c.isAnon,
    risk: c.risk,
    tags: c.tags,
  };
}

// Resolve curation state for a page from its slug (the read-view path).
// `/patrol-status` gives the authoritative latest sha + patrol bit for any age;
// the recent-changes feed enriches it with author + risk when the edit is still
// in the window (best-effort — older edits just won't show those).
export async function loadCuration(slug: string): Promise<Curation> {
  const [status, changes] = await Promise.all([
    getJson<{ patrolled: boolean; sha: string | null }>(
      `/patrol-status?slug=${encodeURIComponent(slug)}`,
    ),
    listChanges().catch(() => [] as Change[]),
  ]);
  const c = status.sha
    ? changes.find((x) => x.sha === status.sha)
    : changes.find((x) => x.slugs.includes(slug));
  return {
    slug,
    sha: status.sha ?? c?.sha ?? null,
    patrolled: status.patrolled,
    author: c?.author,
    isAnon: c?.isAnon,
    risk: c?.risk,
    tags: c?.tags ?? [],
  };
}
