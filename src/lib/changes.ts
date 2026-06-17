import { getJson, postJson } from "./api";

export interface Change {
  sha: string;
  author: string;
  isAnon: boolean;
  date: string;
  message: string;
  additions: number;
  deletions: number;
  slugs: string[];
  created: string[];
  patrolled: boolean;
  tags: string[];
  risk: number;
}

// Keep in sync with RISK_HIGH in worker/src/risk.ts.
export const RISK_HIGH = 50;

// The automoderator's commit-author label; its reverts carry this author.
// Keep in sync with AUTOMOD_AUTHOR in worker/src/automod.ts.
export const AUTOMOD_AUTHOR = "automoderator";

export interface ChangesQuery {
  limit?: number;
  page?: number;
  author?: string;
  unreviewed?: boolean;
  highRisk?: boolean;
}
export interface ChangesPage {
  changes: Change[];
  hasMore: boolean;
}

// Filtering/paging is server-side, so a filter spans the whole feed and "load
// more" pages through it. `hasMore` says whether another page exists.
export async function fetchChanges(query: ChangesQuery = {}): Promise<ChangesPage> {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.page) params.set("page", String(query.page));
  if (query.author) params.set("author", query.author);
  if (query.unreviewed) params.set("unreviewed", "1");
  if (query.highRisk) params.set("highRisk", "1");
  return getJson<ChangesPage>(`/changes?${params}`);
}

export async function listChanges(limit = 30): Promise<Change[]> {
  return (await fetchChanges({ limit })).changes;
}

export async function markPatrolled(sha: string): Promise<void> {
  await postJson<{ ok: true }>("/patrol", { sha });
}
