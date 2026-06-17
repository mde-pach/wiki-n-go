import { type AuditEntry, appendAudit, listAudit } from "../audit";
import {
  type NormalBan,
  normalizeBan,
  parseBans,
  parseExpiry,
  serializeBan,
} from "../bans";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { defineRepoList, repoSlug } from "../repo";
import type { BanBody, Env, UnbanBody } from "../types";

const BANS_PATH = "bans.json";
const bansStore = defineRepoList<NormalBan>(BANS_PATH, parseBans, (list) =>
  list.map(serializeBan),
);

export async function listBans(env: Env): Promise<{ bans: NormalBan[] }> {
  return { bans: (await bansStore.read(env)).list };
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
  const expires = body.expires ? parseExpiry(String(body.expires)) : undefined;
  // A past (or "0m") expiry would create a ban that lists as active but is
  // treated as already-lifted everywhere — fail-open. Reject it up front.
  if (expires && Date.parse(expires) <= Date.now())
    throw new HttpError(400, "Ban expiry must be in the future.");

  const writer = await requireMaintainer(env, request, "Banning");
  const { list: current, sha } = await bansStore.read(env);
  const list = current.filter((b) => b.key !== key);
  list.push(
    normalizeBan(
      serializeBan({
        key,
        paths,
        reason,
        by: writer.name,
        at: new Date().toISOString(),
        expires,
      }),
    ),
  );

  const author = { name: writer.name, email: writer.email };
  await bansStore.write(env, sha, list, `Ban ${key}`, author);
  await appendAudit(
    env,
    repoSlug(env),
    writer.name,
    writer.email,
    "ban",
    key,
    [
      paths.length ? `paths: ${paths.join(", ")}` : "site-wide",
      expires ? `until ${expires}` : null,
      reason,
    ]
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
  const { list, sha } = await bansStore.read(env);
  const next = list.filter((b) => b.key !== key);
  if (next.length === list.length) throw new HttpError(404, "No such ban.");

  const author = { name: writer.name, email: writer.email };
  await bansStore.write(env, sha, next, `Unban ${key}`, author);
  await appendAudit(env, repoSlug(env), writer.name, writer.email, "unban", key);
  return { ok: true };
}

export async function auditLog(
  env: Env,
  request: Request,
  limitStr: string,
): Promise<{ entries: AuditEntry[] }> {
  await requireMaintainer(env, request, "Viewing the audit log");
  const limit = Math.min(Math.max(Number.parseInt(limitStr, 10) || 50, 1), 200);
  return { entries: await listAudit(env, repoSlug(env), limit) };
}
