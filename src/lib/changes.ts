import { config } from "../config";

export interface Change {
  sha: string;
  author: string;
  isAnon: boolean;
  date: string;
  message: string;
  additions: number;
  deletions: number;
  slugs: string[];
  patrolled: boolean;
  tags: string[];
}

export async function listChanges(limit = 30): Promise<Change[]> {
  const res = await fetch(`${config.workerUrl}/changes?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load changes (HTTP ${res.status}).`);
  return ((await res.json()) as { changes: Change[] }).changes;
}

export async function markPatrolled(sha: string): Promise<void> {
  const res = await fetch(`${config.workerUrl}/patrol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
}
