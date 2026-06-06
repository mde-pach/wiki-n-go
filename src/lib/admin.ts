import { getJson, postJson } from "./api";

export interface Ban {
  key: string;
  paths: string[];
  reason?: string;
  by?: string;
  at?: string;
}

export interface AuditEntry {
  at: string;
  by: string;
  action: string;
  target: string;
  detail?: string;
}

export async function rollbackCommit(sha: string): Promise<string[]> {
  const data = await postJson<{ ok: true; restored: string[] }>("/rollback", { sha });
  return data.restored;
}

export async function restoreRevision(slug: string, rev: string): Promise<void> {
  await postJson<{ ok: true }>("/restore", { slug, rev });
}

export async function setProtection(slug: string, tier: string): Promise<void> {
  await postJson<{ ok: true }>("/protect", { slug, tier });
}

export async function listBans(): Promise<Ban[]> {
  const data = await getJson<{ bans: Ban[] }>("/bans");
  return data.bans;
}

export async function addBan(
  key: string,
  paths: string[],
  reason?: string,
): Promise<void> {
  await postJson<{ ok: true }>("/ban", { key, paths, reason });
}

export async function removeBan(key: string): Promise<void> {
  await postJson<{ ok: true }>("/unban", { key });
}

export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  const data = await getJson<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`, {
    auth: true,
  });
  return data.entries;
}
