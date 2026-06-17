import { appendAudit } from "../audit";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { defineRepoList, repoSlug } from "../repo";
import {
  invalidateSuppressions,
  parseSuppressions,
  type Suppression,
} from "../suppression";
import type { Env, SuppressBody } from "../types";

const SUPPRESSED_PATH = "suppressed.json";
const suppressedStore = defineRepoList<Suppression>(SUPPRESSED_PATH, parseSuppressions);

export async function listSuppressed(
  env: Env,
  request: Request,
): Promise<{ suppressions: Suppression[] }> {
  await requireMaintainer(env, request, "Viewing suppressions");
  return { suppressions: (await suppressedStore.read(env)).list };
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
  const { list: existing, sha } = await suppressedStore.read(env);
  const list = existing.filter((s) => !(s.type === type && s.value === value));
  list.push({ type, value, reason, by: writer.name, at: new Date().toISOString() });

  const author = { name: writer.name, email: writer.email };
  await suppressedStore.write(env, sha, list, `Suppress ${type} ${value}`, author);
  await invalidateSuppressions(env);
  await appendAudit(
    env,
    repoSlug(env),
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
  const { list, sha } = await suppressedStore.read(env);
  const next = list.filter((s) => !(s.type === type && s.value === value));
  if (next.length === list.length) throw new HttpError(404, "No such suppression.");

  const author = { name: writer.name, email: writer.email };
  await suppressedStore.write(env, sha, next, `Unsuppress ${type} ${value}`, author);
  await invalidateSuppressions(env);
  await appendAudit(
    env,
    repoSlug(env),
    writer.name,
    writer.email,
    "unsuppress",
    `${type}:${value}`,
  );
  return { ok: true };
}
