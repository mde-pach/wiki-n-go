import { appendAudit } from "../audit";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { defineRepoList, repoSlug } from "../repo";
import type { Env, GrantBody } from "../types";

const EDITORS_PATH = "trusted-editors.json";

function parseEditors(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

const editorsStore = defineRepoList<string>(EDITORS_PATH, parseEditors);

export async function listEditors(
  env: Env,
  request: Request,
): Promise<{ editors: string[]; owner: string }> {
  await requireMaintainer(env, request, "Viewing editors");
  return { editors: (await editorsStore.read(env)).list, owner: env.REPO_OWNER };
}

async function writeEditors(
  env: Env,
  request: Request,
  action: "grant" | "revoke",
  body: GrantBody,
): Promise<{ ok: true }> {
  const key = String(body.key ?? "").trim();
  if (!key) throw new HttpError(400, "Missing editor.");
  const writer = await requireMaintainer(env, request, "Managing rights");

  const { list, sha } = await editorsStore.read(env);
  const next =
    action === "grant"
      ? list.includes(key)
        ? list
        : [...list, key]
      : list.filter((e) => e !== key);
  if (action === "revoke" && next.length === list.length)
    throw new HttpError(404, "Not a granted editor.");

  await editorsStore.write(
    env,
    sha,
    next,
    `${action === "grant" ? "Grant" : "Revoke"} maintainer: ${key}`,
    { name: writer.name, email: writer.email },
  );
  // Drop the cached maintainer set so the grant/revoke takes effect now, not
  // after the TTL (config-maintainers via wikigit.json go through putConfig).
  await env.RATE_LIMIT?.delete("maintainers:set");
  await appendAudit(env, repoSlug(env), writer.name, writer.email, action, key);
  return { ok: true };
}

export const grant = (env: Env, request: Request, body: GrantBody) =>
  writeEditors(env, request, "grant", body);
export const revoke = (env: Env, request: Request, body: GrantBody) =>
  writeEditors(env, request, "revoke", body);
