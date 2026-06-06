import { postJson } from "./api";

export async function rollbackCommit(sha: string): Promise<string[]> {
  const data = await postJson<{ ok: true; restored: string[] }>("/rollback", { sha });
  return data.restored;
}
