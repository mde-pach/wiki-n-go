import { type AuditEntry, appendAudit, listAudit } from "../audit";
import { type NormalBan, normalizeBan, parseBans, serializeBan } from "../bans";
import { gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { commitPayload, getCurrentFile } from "../repo";
import type { BanBody, Env, UnbanBody } from "../types";

const BANS_PATH = "bans.json";

export async function listBans(env: Env): Promise<{ bans: NormalBan[] }> {
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    BANS_PATH,
  );
  return { bans: parseBans(current?.raw) };
}

async function writeBans(
  env: Env,
  repo: string,
  sha: string | undefined,
  list: NormalBan[],
  message: string,
  by: { name: string; email: string },
): Promise<void> {
  const out = list.map(serializeBan);
  await gh(env, `/repos/${repo}/contents/${BANS_PATH}`, {
    method: "PUT",
    body: commitPayload(env, {
      message,
      content: `${JSON.stringify(out, null, 2)}\n`,
      branch: env.BRANCH,
      sha,
      author: by,
    }),
  });
}

export async function ban(
  env: Env,
  request: Request,
  body: BanBody,
): Promise<{ ok: true }> {
  const key = String(body.key ?? "").trim();
  if (!key) throw new HttpError(400, "Missing ban target.");
  const paths = Array.isArray(body.paths)
    ? body.paths.map((p) => String(p).trim()).filter(Boolean)
    : [];
  const reason = body.reason ? String(body.reason).slice(0, 280) : undefined;

  const writer = await requireMaintainer(env, request, "Banning");
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const current = await getCurrentFile(env, repo, BANS_PATH);
  const list = parseBans(current?.raw).filter((b) => b.key !== key);
  list.push(
    normalizeBan(
      serializeBan({
        key,
        paths,
        reason,
        by: writer.name,
        at: new Date().toISOString(),
      }),
    ),
  );

  const author = { name: writer.name, email: writer.email };
  await writeBans(env, repo, current?.sha, list, `Ban ${key}`, author);
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "ban",
    key,
    [paths.length ? `paths: ${paths.join(", ")}` : "site-wide", reason]
      .filter(Boolean)
      .join(" · "),
  );
  return { ok: true };
}

export async function unban(
  env: Env,
  request: Request,
  body: UnbanBody,
): Promise<{ ok: true }> {
  const key = String(body.key ?? "").trim();
  if (!key) throw new HttpError(400, "Missing ban target.");

  const writer = await requireMaintainer(env, request, "Unbanning");
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const current = await getCurrentFile(env, repo, BANS_PATH);
  const list = parseBans(current?.raw);
  const next = list.filter((b) => b.key !== key);
  if (next.length === list.length) throw new HttpError(404, "No such ban.");

  const author = { name: writer.name, email: writer.email };
  await writeBans(env, repo, current?.sha, next, `Unban ${key}`, author);
  await appendAudit(env, repo, writer.name, writer.email, "unban", key);
  return { ok: true };
}

export async function auditLog(
  env: Env,
  request: Request,
  limitStr: string,
): Promise<{ entries: AuditEntry[] }> {
  await requireMaintainer(env, request, "Viewing the audit log");
  const limit = Math.min(Math.max(Number.parseInt(limitStr, 10) || 50, 1), 200);
  return { entries: await listAudit(env, `${env.REPO_OWNER}/${env.REPO_NAME}`, limit) };
}
