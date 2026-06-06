import { gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { invalidateContent } from "../kv";
import type { Env } from "../types";
import { type PatrolBody, type ReviewBody, SHA_RE } from "../types";
import { isInSiteRef, refIdentity } from "./content";

// Mark a commit reviewed. Maintainer-only, by trust tier — no token needed
// (it only flips a flag).
export async function patrol(
  env: Env,
  request: Request,
  body: PatrolBody,
): Promise<{ ok: true }> {
  const sha = String(body.sha ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  await requireMaintainer(env, request, "Patrolling");
  await env.RATE_LIMIT?.put(`patrol:${sha}`, "1");
  return { ok: true };
}

// Merge (squash → live) or close a pending edit. Maintainer-only.
export async function review(
  env: Env,
  request: Request,
  body: ReviewBody,
): Promise<{ ok: true }> {
  const number = Number(body.number);
  const action = String(body.action ?? "");
  if (!Number.isInteger(number) || number <= 0)
    throw new HttpError(400, "Invalid pull request.");
  if (action !== "merge" && action !== "close")
    throw new HttpError(400, "Invalid action.");

  await requireMaintainer(env, request, "Reviewing");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const pr = await gh<{ head: { ref: string }; title: string }>(
    env,
    `/repos/${repo}/pulls/${number}`,
  );
  if (!isInSiteRef(pr.head.ref)) throw new HttpError(400, "Not an in-site edit.");

  if (action === "merge") {
    await gh(env, `/repos/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", commit_title: pr.title }),
    });
    await invalidateContent(env, refIdentity(pr.head.ref).author);
  } else {
    await gh(env, `/repos/${repo}/pulls/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
  }
  await gh(env, `/repos/${repo}/git/refs/heads/${pr.head.ref}`, {
    method: "DELETE",
    allow404: true,
  });
  return { ok: true };
}
