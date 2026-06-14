import { gh } from "../github";
import { requireMaintainer } from "../identity";
import { commitPayload, getCurrentFile } from "../repo";
import { parseConfigFile, sanitizeConfig, type WikigitConfig } from "../siteconfig";
import type { Env } from "../types";

export const CONFIG_PATH = "wikigit.json";

// The wiki's owner-editable config (title / languages / theme), read live from
// the repo. Tenant-aware; the reader merges it over its baked defaults.
export async function getConfig(env: Env): Promise<{ config: WikigitConfig }> {
  const file = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    CONFIG_PATH,
  );
  return { config: parseConfigFile(file?.raw) };
}

// Commit a new config from the settings form. Maintainer-only. The body is
// whitelisted (sanitizeConfig) so only known, well-typed fields are persisted —
// the file can't smuggle arbitrary keys the reader would trust.
export async function putConfig(
  env: Env,
  request: Request,
  body: unknown,
): Promise<{ ok: true; config: WikigitConfig }> {
  const writer = await requireMaintainer(env, request, "Editing settings");
  const config = sanitizeConfig(body);
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const current = await getCurrentFile(env, repo, CONFIG_PATH);
  await gh(env, `/repos/${repo}/contents/${CONFIG_PATH}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: "config: update wiki settings",
      content: `${JSON.stringify(config, null, 2)}\n`,
      branch: env.BRANCH,
      sha: current?.sha,
      author: { name: writer.name, email: writer.email },
    }),
  });
  return { ok: true, config };
}
