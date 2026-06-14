import { appendAudit } from "../audit";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { commitJson, getCurrentFile } from "../repo";
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

export async function listEditors(
  env: Env,
  request: Request,
): Promise<{ editors: string[]; owner: string }> {
  await requireMaintainer(env, request, "Viewing editors");
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    EDITORS_PATH,
  );
  return { editors: parseEditors(current?.raw), owner: env.REPO_OWNER };
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

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const current = await getCurrentFile(env, repo, EDITORS_PATH);
  const list = parseEditors(current?.raw);
  const next =
    action === "grant"
      ? list.includes(key)
        ? list
        : [...list, key]
      : list.filter((e) => e !== key);
  if (action === "revoke" && next.length === list.length)
    throw new HttpError(404, "Not a granted editor.");

  await commitJson(
    env,
    EDITORS_PATH,
    next,
    `${action === "grant" ? "Grant" : "Revoke"} maintainer: ${key}`,
    { name: writer.name, email: writer.email },
    current?.sha,
  );
  await appendAudit(env, repo, writer.name, writer.email, action, key);
  return { ok: true };
}

export const grant = (env: Env, request: Request, body: GrantBody) =>
  writeEditors(env, request, "grant", body);
export const revoke = (env: Env, request: Request, body: GrantBody) =>
  writeEditors(env, request, "revoke", body);
