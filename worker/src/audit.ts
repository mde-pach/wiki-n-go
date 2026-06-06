import { gh } from "./github";
import { commitPayload, getCurrentFile } from "./repo";
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
  const current = await getCurrentFile(env, repo, AUDIT_PATH);
  const prefix = current?.raw ? current.raw.replace(/\n*$/, "\n") : "";
  await gh(env, `/repos/${repo}/contents/${AUDIT_PATH}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: `audit: ${action} ${target}`,
      content: `${prefix}${JSON.stringify(entry)}\n`,
      branch: env.BRANCH,
      sha: current?.sha,
      author: { name: by, email },
    }),
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
