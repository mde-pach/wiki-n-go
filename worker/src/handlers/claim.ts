import { repoInstallationId } from "../githubApp";
import { HttpError } from "../http";
import { sessionIdentity } from "../identity/auth";
import { provisionRepo } from "../provision";
import {
  nameAvailability,
  ownerWikiCount,
  readRegistry,
  registerTenant,
} from "../registry";
import { botCommitter } from "../repo";
import type { Env } from "../types";

export interface ClaimBody {
  name?: unknown;
  lane?: unknown;
  repo?: unknown; // "owner/name", bring-your-own lane only
}

const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const DEFAULT_MAX_WIKIS = 5;
const CLAIM_RATE_MAX = 10; // claims per window per identity — coarse burst control
const CLAIM_RATE_WINDOW_S = 3600;

export function ownerKey(s: {
  provider?: string;
  login: string;
  sub?: string;
}): string {
  return s.provider === "wikigit" ? `wg:${s.sub ?? s.login}` : `gh:${s.login}`;
}

// The operator kill-switch: any truthy flag (≠ "0"/"false") pauses provisioning.
export function provisioningPaused(env: Env): boolean {
  const v = (env.PROVISION_PAUSED ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

export function maxWikisPerOwner(env: Env): number {
  const n = Number.parseInt(env.MAX_WIKIS_PER_OWNER ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_WIKIS;
}

// Fixed-window per-identity claim limiter (mirrors moderation's edit limiter).
// Coarse burst control on top of the per-owner quota; inert without RATE_LIMIT.
export async function enforceClaimRate(env: Env, owner: string): Promise<void> {
  if (!env.RATE_LIMIT) return;
  const key = `claimrl:${owner}`;
  const count = Number.parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10);
  if (count >= CLAIM_RATE_MAX)
    throw new HttpError(429, "Too many wikis created — try again later.");
  await env.RATE_LIMIT.put(key, String(count + 1), {
    expirationTtl: CLAIM_RATE_WINDOW_S,
  });
}

// Claim a `<name>.<platform>` wiki. Sign-in required (open self-serve otherwise).
// Two lanes: "platform" provisions a repo under the operator org; "byo" points at
// the user's own repo (which must have the content App installed). Operator-global
// — writes the registry to the operator repo, so it runs before the tenant gate.
export async function claim(
  env: Env,
  request: Request,
  body: ClaimBody,
): Promise<{ ok: true; name: string; repo: string; lane: string; url: string }> {
  const session = await sessionIdentity(env, request);
  if (!session) throw new HttpError(401, "Sign in to create a wiki.");
  if (provisioningPaused(env))
    throw new HttpError(503, "New wikis are paused right now. Please try again later.");

  const owner = ownerKey(session);
  const name = String(body.name ?? "").toLowerCase();
  const lane = body.lane === "byo" ? "byo" : "platform";

  const avail = await nameAvailability(env, name);
  if (!avail.available) {
    const why =
      avail.reason === "taken"
        ? "That name is taken."
        : avail.reason === "reserved"
          ? "That name is reserved."
          : "Use 1–40 lowercase letters, numbers, or hyphens.";
    throw new HttpError(409, why);
  }

  // Per-identity ceiling on managed wikis (byo lives in the owner's own repo, so
  // it's uncapped). Counts the owner's current platform-lane tenants.
  if (lane === "platform") {
    const max = maxWikisPerOwner(env);
    if (ownerWikiCount(await readRegistry(env), owner) >= max)
      throw new HttpError(429, `You've reached the limit of ${max} hosted wikis.`);
  }

  // Burst control once the claim is otherwise valid (so typos/taken names don't
  // burn the window).
  await enforceClaimRate(env, owner);

  let repo: string;
  if (lane === "byo") {
    repo = String(body.repo ?? "");
    if (!REPO_RE.test(repo)) throw new HttpError(400, "Enter a valid owner/repo.");
    const [owner, repoName] = repo.split("/");
    if (!(await repoInstallationId(env, owner, repoName)))
      throw new HttpError(400, "Install the Wikigit app on that repo first.");
  } else {
    repo = await provisionRepo(env, name);
  }

  await registerTenant(
    env,
    { name, repo, owner, lane, at: new Date().toISOString() },
    botCommitter(env),
  );

  const host = env.PLATFORM_HOST || "";
  return { ok: true, name, repo, lane, url: `https://${name}.${host}` };
}
