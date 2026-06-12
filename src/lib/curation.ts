import { getJson } from "./api";
import type { Change } from "./changes";

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

// The authoritative latest sha + patrol bit for a page, one fast Worker call —
// enough to render the actionable bar (approve, tag, roll back, delete) without
// waiting on the slower recent-changes feed.
export async function loadPatrolStatus(slug: string): Promise<Curation> {
  const status = await getJson<{ patrolled: boolean; sha: string | null }>(
    `/patrol-status?slug=${encodeURIComponent(slug)}`,
  );
  return { slug, sha: status.sha, patrolled: status.patrolled, tags: [] };
}

// Enrich a base curation with author/risk/tags from the recent-changes feed,
// matched by sha (or slug when the latest sha is unknown). Best-effort — an edit
// that's aged out of the window just keeps the base, sans those extras.
export function enrichCuration(base: Curation, changes: Change[]): Curation {
  const c = base.sha
    ? changes.find((x) => x.sha === base.sha)
    : changes.find((x) => x.slugs.includes(base.slug));
  if (!c) return base;
  return {
    ...base,
    sha: base.sha ?? c.sha,
    author: c.author,
    isAnon: c.isAnon,
    risk: c.risk,
    tags: c.tags,
  };
}
