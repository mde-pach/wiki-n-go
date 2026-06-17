import { appendJsonl, getCurrentFile } from "./repo";
import type { Env } from "./types";

export interface AuditEntry {
  at: string;
  by: string;
  action: string;
  target: string;
  detail?: string;
}

const AUDIT_PATH = "audit-log.jsonl";

// Append-only log of admin actions that don't speak for themselves in git
// (rollback, ban, unban). One JSON object per line, committed at the repo root.
// Low-frequency by nature, so a commit per entry is fine.
export async function appendAudit(
  env: Env,
  repo: string,
  by: string,
  email: string,
  action: string,
  target: string,
  detail?: string,
): Promise<void> {
  const entry: AuditEntry = {
    at: new Date().toISOString(),
    by,
    action,
    target,
    ...(detail ? { detail } : {}),
  };
  await appendJsonl(env, repo, AUDIT_PATH, entry, `audit: ${action} ${target}`, {
    name: by,
    email,
  });
}

export async function listAudit(
  env: Env,
  repo: string,
  limit: number,
): Promise<AuditEntry[]> {
  const current = await getCurrentFile(env, repo, AUDIT_PATH);
  if (!current?.raw) return [];
  const entries: AuditEntry[] = [];
  for (const line of current.raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {}
  }
  return entries.reverse().slice(0, limit);
}
