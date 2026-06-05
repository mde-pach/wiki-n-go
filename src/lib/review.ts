import { config } from "../config";

export interface Pending {
  number: number;
  author: string;
  slug: string;
  title: string;
  createdAt: string;
  additions: number;
  deletions: number;
}

export async function listPending(): Promise<Pending[]> {
  const res = await fetch(`${config.workerUrl}/pending`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load pending edits (HTTP ${res.status}).`);
  return ((await res.json()) as { pending: Pending[] }).pending;
}

export async function getPendingDiff(number: number): Promise<string | null> {
  const res = await fetch(`${config.workerUrl}/pending-diff?number=${number}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load diff (HTTP ${res.status}).`);
  return ((await res.json()) as { patch: string | null }).patch;
}

export async function reviewPr(
  number: number,
  action: "merge" | "close",
): Promise<void> {
  const res = await fetch(`${config.workerUrl}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number, action }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
}
