import { config } from "../config";

export interface Revision {
  sha: string;
  parent: string | null;
  author: string;
  date: string;
  message: string;
}

export async function getHistory(slug: string): Promise<Revision[]> {
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
