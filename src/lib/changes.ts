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

export async function listChanges(limit = 30): Promise<Change[]> {
  const data = await getJson<{ changes: Change[] }>(`/changes?limit=${limit}`);
  return data.changes;
}

export async function markPatrolled(sha: string): Promise<void> {
  await postJson<{ ok: true }>("/patrol", { sha });
}
