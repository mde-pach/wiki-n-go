import { repoInstallationId } from "../githubApp";
import { HttpError } from "../http";
import { sessionIdentity } from "../identity/auth";
import { provisionRepo } from "../provision";
import { nameAvailability, registerTenant } from "../registry";
import { botCommitter } from "../repo";
import type { Env } from "../types";

export interface ClaimBody {
  name?: unknown;
  lane?: unknown;
  repo?: unknown; // "owner/name", bring-your-own lane only
}

const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function ownerKey(s: { provider?: string; login: string; sub?: string }): string {
  return s.provider === "wikigit" ? `wg:${s.sub ?? s.login}` : `gh:${s.login}`;
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
    { name, repo, owner: ownerKey(session), lane, at: new Date().toISOString() },
    botCommitter(env),
  );

  const host = env.PLATFORM_HOST || "";
  return { ok: true, name, repo, lane, url: `https://${name}.${host}` };
}
