import { appendAudit } from "../audit";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { commitJson, getCurrentFile } from "../repo";
import { parseSuppressions, type Suppression } from "../suppression";
import type { Env, SuppressBody } from "../types";

const SUPPRESSED_PATH = "suppressed.json";

async function readSuppressed(
  env: Env,
): Promise<{ list: Suppression[]; sha: string | undefined }> {
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    SUPPRESSED_PATH,
  );
  return { list: parseSuppressions(current?.raw), sha: current?.sha };
}

export async function listSuppressed(
  env: Env,
  request: Request,
): Promise<{ suppressions: Suppression[] }> {
  await requireMaintainer(env, request, "Viewing suppressions");
  return { suppressions: (await readSuppressed(env)).list };
}

const writeSuppressed = (
  env: Env,
  sha: string | undefined,
  list: Suppression[],
  message: string,
  by: { name: string; email: string },
) => commitJson(env, SUPPRESSED_PATH, list, message, by, sha);

export async function suppress(
  env: Env,
  request: Request,
  body: SuppressBody,
): Promise<{ ok: true }> {
  const type = String(body.type ?? "");
  const value = String(body.value ?? "").trim();
  if (type !== "author" && type !== "revision")
    throw new HttpError(400, "Invalid suppression type.");
  if (!value) throw new HttpError(400, "Missing suppression target.");
  const reason = body.reason ? String(body.reason).slice(0, 280) : undefined;

  const writer = await requireMaintainer(env, request, "Suppression");
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const { list: existing, sha } = await readSuppressed(env);
  const list = existing.filter((s) => !(s.type === type && s.value === value));
  list.push({ type, value, reason, by: writer.name, at: new Date().toISOString() });

  const author = { name: writer.name, email: writer.email };
  await writeSuppressed(env, sha, list, `Suppress ${type} ${value}`, author);
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "suppress",
    `${type}:${value}`,
  );
  return { ok: true };
}

export async function unsuppress(
  env: Env,
  request: Request,
  body: SuppressBody,
): Promise<{ ok: true }> {
  const type = String(body.type ?? "");
  const value = String(body.value ?? "").trim();
  if (!value) throw new HttpError(400, "Missing suppression target.");

  const writer = await requireMaintainer(env, request, "Suppression");
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const { list, sha } = await readSuppressed(env);
  const next = list.filter((s) => !(s.type === type && s.value === value));
  if (next.length === list.length) throw new HttpError(404, "No such suppression.");

  const author = { name: writer.name, email: writer.email };
  await writeSuppressed(env, sha, next, `Unsuppress ${type} ${value}`, author);
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "unsuppress",
    `${type}:${value}`,
  );
  return { ok: true };
}
