import { getJson, postJson } from "./api";

export interface Pending {
  number: number;
  author: string;
  isAnon: boolean;
  slug: string;
  title: string;
  createdAt: string;
  additions: number;
  deletions: number;
}

export async function listPending(): Promise<Pending[]> {
  const data = await getJson<{ pending: Pending[] }>("/pending");
  return data.pending;
}

export async function getPendingDiff(number: number): Promise<string | null> {
  const data = await getJson<{ patch: string | null }>(
    `/pending-diff?number=${number}`,
  );
  return data.patch;
}

export async function reviewPr(
  number: number,
  action: "merge" | "close",
): Promise<void> {
  await postJson<{ ok: true }>("/review", { number, action });
}
