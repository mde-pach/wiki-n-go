import {
  appHeaders,
  installationAccessToken,
  normalizePrivateKey,
  signAppJwt,
} from "./githubApp";
import { HttpError } from "./http";
import type { Env } from "./types";

// Managed-lane provisioning: create a tenant repo under the platform org using
// the operator-only wikigit-platform App (Administration write). The content App
// (wikigit-app, installed org-wide) serves it afterward; this App only creates
// and seeds. Key + org live only on the hosted Engine — see two-App model.

const TOKEN_SKEW_MS = 60_000; // re-mint a minute before the installation token expires
let cached: { token: string; expiresAtMs: number } | null = null;

export function platformEnabled(env: Env): boolean {
  return Boolean(
    env.GITHUB_PLATFORM_APP_ID &&
      env.GITHUB_PLATFORM_APP_PRIVATE_KEY &&
      env.PLATFORM_ORG,
  );
}

async function platformToken(env: Env): Promise<string> {
  if (cached && cached.expiresAtMs - TOKEN_SKEW_MS > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signAppJwt(
    env.GITHUB_PLATFORM_APP_ID as string,
    normalizePrivateKey(env.GITHUB_PLATFORM_APP_PRIVATE_KEY as string),
    now,
  );
  const res = await fetch(
    `https://api.github.com/orgs/${env.PLATFORM_ORG}/installation`,
    { headers: appHeaders(jwt, env) },
  );
  if (!res.ok)
    throw new HttpError(502, `Platform app not installed on ${env.PLATFORM_ORG}`);
  const installationId = String(((await res.json()) as { id: number }).id);
  cached = await installationAccessToken(env, jwt, installationId);
  return cached.token;
}

function ghHeaders(token: string, env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${env.REPO_NAME}-worker`,
  };
}

async function seedFile(
  env: Env,
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(token, env),
    body: JSON.stringify({ message, content: btoa(content), branch: env.BRANCH }),
  });
  if (!res.ok) throw new HttpError(502, `Seed ${path} failed (${res.status})`);
}

function titleCase(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Create + seed `${PLATFORM_ORG}/<name>` and return its full "owner/name". The
// repo auto-inits (gets a default branch); we then add a home page and a
// wikigit.json titled from the name. Idempotency: a name collision (repo exists)
// surfaces as a clean 409 so the caller maps it to "name taken".
export async function provisionRepo(env: Env, name: string): Promise<string> {
  if (!platformEnabled(env))
    throw new HttpError(503, "Managed hosting isn't configured on this Engine.");
  const token = await platformToken(env);
  const org = env.PLATFORM_ORG as string;
  const repo = `${org}/${name}`;

  const created = await fetch(`https://api.github.com/orgs/${org}/repos`, {
    method: "POST",
    headers: ghHeaders(token, env),
    body: JSON.stringify({
      name,
      private: false,
      auto_init: true,
      description: `A Wikigit wiki — ${titleCase(name)}`,
    }),
  });
  if (created.status === 422) throw new HttpError(409, "Name already taken.");
  if (!created.ok) throw new HttpError(502, `Repo create failed (${created.status})`);

  const home = `# ${titleCase(name)}\n\nWelcome to your new wiki. Click **Edit** to start writing.\n`;
  await seedFile(
    env,
    token,
    repo,
    `${env.CONTENT_DIR}/index.md`,
    home,
    "seed: home page",
  );
  await seedFile(
    env,
    token,
    repo,
    "wikigit.json",
    `${JSON.stringify({ title: titleCase(name) }, null, 2)}\n`,
    "seed: wiki config",
  );
  return repo;
}
