import { repoInstallationId } from "../githubApp";
import { HttpError } from "../http";
import { sessionIdentity } from "../identity/auth";
import { platformEnabled, transferRepo } from "../provision";
import { readRegistry, repointTenant, type Tenant } from "../registry";
import { botCommitter } from "../repo";
import type { Env } from "../types";
import { ownerKey } from "./claim";

// The "Quick lane is never a trap" bridge: move a managed `wikigit-tenants/<name>`
// repo to the owner's own GitHub account, then keep the subdomain serving from
// the new repo. Two steps, because the GitHub transfer must be ACCEPTED by the
// new owner out-of-band:
//   1. POST /transfer          — initiate the GitHub transfer (platform App).
//   2. POST /transfer/complete — after the owner accepts + installs the content
//                                App on the moved repo, re-point the registry.
// Both are operator-global (they read/write the operator registry) and gated on
// the registry `owner`, so you can only move your own wiki.

export interface TransferBody {
  name?: unknown;
  target?: unknown; // the destination GitHub login/org that will own the repo
}

// GitHub username/org grammar (≤39 chars, alphanumeric with non-consecutive,
// non-trailing hyphens).
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

async function ownTenant(env: Env, request: Request, name: string): Promise<Tenant> {
  const session = await sessionIdentity(env, request);
  if (!session) throw new HttpError(401, "Sign in to move your wiki.");
  const tenant = (await readRegistry(env)).get(name);
  if (!tenant) throw new HttpError(404, "No such wiki.");
  if (tenant.owner !== ownerKey(session))
    throw new HttpError(403, "Only the wiki's owner can move it.");
  return tenant;
}

export async function transfer(
  env: Env,
  request: Request,
  body: TransferBody,
): Promise<{ ok: true; pending: true; newRepo: string }> {
  if (!platformEnabled(env))
    throw new HttpError(503, "Managed hosting isn't configured on this Engine.");
  const name = String(body.name ?? "");
  const target = String(body.target ?? "");
  if (!OWNER_RE.test(target))
    throw new HttpError(400, "Enter a valid GitHub username.");

  const tenant = await ownTenant(env, request, name);
  if (tenant.lane !== "platform" || tenant.repo !== `${env.PLATFORM_ORG}/${name}`)
    throw new HttpError(400, "Only a managed wiki can be moved to your GitHub.");

  await transferRepo(env, name, target);
  return { ok: true, pending: true, newRepo: `${target}/${name}` };
}

export async function transferComplete(
  env: Env,
  request: Request,
  body: TransferBody,
): Promise<{ ok: true; repo: string; url: string }> {
  const name = String(body.name ?? "");
  const target = String(body.target ?? "");
  if (!OWNER_RE.test(target))
    throw new HttpError(400, "Enter a valid GitHub username.");

  const tenant = await ownTenant(env, request, name);
  const repo = `${target}/${name}`;
  if (!(await repoInstallationId(env, target, name)))
    throw new HttpError(
      400,
      "Install the Wikigit app on the transferred repo first, then finish the move.",
    );

  await repointTenant(
    env,
    { name, repo, owner: tenant.owner, lane: "byo", at: new Date().toISOString() },
    botCommitter(env),
  );
  const host = env.PLATFORM_HOST || "";
  return { ok: true, repo, url: `https://${name}.${host}` };
}
