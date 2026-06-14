import { getJson, postJson } from "./api";
import type { WikigitConfig } from "./site-config";

export async function saveSiteConfig(config: WikigitConfig): Promise<WikigitConfig> {
  const data = await postJson<{ ok: true; config: WikigitConfig }>("/config", config);
  return data.config;
}

export interface Ban {
  key: string;
  paths: string[];
  reason?: string;
  by?: string;
  at?: string;
  expires?: string;
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
  expires?: string,
): Promise<void> {
  await postJson<{ ok: true }>("/ban", { key, paths, reason, expires });
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

export async function deletePage(slug: string): Promise<void> {
  await postJson<{ ok: true }>("/delete", { slug });
}

export async function tagChange(sha: string, tag: string): Promise<void> {
  await postJson<{ ok: true }>("/tag", { sha, tag });
}

export async function listEditors(): Promise<{ editors: string[]; owner: string }> {
  return getJson<{ editors: string[]; owner: string }>("/editors", { auth: true });
}

export async function grantEditor(key: string): Promise<void> {
  await postJson<{ ok: true }>("/grant", { key });
}

export async function revokeEditor(key: string): Promise<void> {
  await postJson<{ ok: true }>("/revoke", { key });
}

export interface Suppression {
  type: "author" | "revision";
  value: string;
  reason?: string;
  by?: string;
  at?: string;
}

export async function listSuppressed(): Promise<Suppression[]> {
  const data = await getJson<{ suppressions: Suppression[] }>("/suppressed", {
    auth: true,
  });
  return data.suppressions;
}

export async function suppress(
  type: "author" | "revision",
  value: string,
  reason?: string,
): Promise<void> {
  await postJson<{ ok: true }>("/suppress", { type, value, reason });
}

export async function unsuppress(
  type: "author" | "revision",
  value: string,
): Promise<void> {
  await postJson<{ ok: true }>("/unsuppress", { type, value });
}
