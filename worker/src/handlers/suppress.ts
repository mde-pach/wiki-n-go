import { appendAudit } from "../audit";
import { gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { commitPayload, getCurrentFile } from "../repo";
import { parseSuppressions, type Suppression } from "../suppression";
import type { Env, SuppressBody } from "../types";

const SUPPRESSED_PATH = "suppressed.json";

export async function listSuppressed(
  env: Env,
  request: Request,
): Promise<{ suppressions: Suppression[] }> {
  await requireMaintainer(env, request, "Viewing suppressions");
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    SUPPRESSED_PATH,
  );
  return { suppressions: parseSuppressions(current?.raw) };
}

async function writeSuppressed(
  env: Env,
  message: string,
  list: Suppression[],
  by: { name: string; email: string },
): Promise<void> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const current = await getCurrentFile(env, repo, SUPPRESSED_PATH);
  await gh(env, `/repos/${repo}/contents/${SUPPRESSED_PATH}`, {
    method: "PUT",
    body: commitPayload(env, {
      message,
      content: `${JSON.stringify(list, null, 2)}\n`,
      branch: env.BRANCH,
      sha: current?.sha,
      author: by,
    }),
  });
}

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
  const current = await getCurrentFile(env, repo, SUPPRESSED_PATH);
  const list = parseSuppressions(current?.raw).filter(
    (s) => !(s.type === type && s.value === value),
  );
  list.push({ type, value, reason, by: writer.name, at: new Date().toISOString() });

  const author = { name: writer.name, email: writer.email };
  await writeSuppressed(env, `Suppress ${type} ${value}`, list, author);
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
  const current = await getCurrentFile(env, repo, SUPPRESSED_PATH);
  const list = parseSuppressions(current?.raw);
  const next = list.filter((s) => !(s.type === type && s.value === value));
  if (next.length === list.length) throw new HttpError(404, "No such suppression.");

  const author = { name: writer.name, email: writer.email };
  await writeSuppressed(env, `Unsuppress ${type} ${value}`, next, author);
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
