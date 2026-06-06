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
}

export async function listChanges(limit = 30): Promise<Change[]> {
  const data = await getJson<{ changes: Change[] }>(`/changes?limit=${limit}`);
  return data.changes;
}

export async function markPatrolled(sha: string): Promise<void> {
  await postJson<{ ok: true }>("/patrol", { sha });
}
