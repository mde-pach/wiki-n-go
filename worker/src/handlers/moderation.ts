import { appendAudit } from "../audit";
import { gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { invalidateContent } from "../kv";
import { botCommitter, commitPayload, getCurrentFile } from "../repo";
import type { Env } from "../types";
import { type PatrolBody, type ReviewBody, type RollbackBody, SHA_RE } from "../types";
import { isInSiteRef, refIdentity } from "./content";
import { removeIndexEntry, updateIndexEntry } from "./index-cache";

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

// Roll back a revision: restore every content page the commit touched to its
// pre-commit (parent) state on the live branch, deleting pages the commit
// created. Lands as a new commit — history is preserved, so a rollback can
// itself be rolled forward. Overwrites any intervening edits to those pages
// (git keeps them); the dashboard confirms before calling. Maintainer-only.
export async function rollback(
  env: Env,
  request: Request,
  body: RollbackBody,
): Promise<{ ok: true; restored: string[] }> {
  const sha = String(body.sha ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  const writer = await requireMaintainer(env, request, "Rollback");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const commit = await gh<{
    parents: { sha: string }[];
    files?: { filename: string }[];
  }>(env, `/repos/${repo}/commits/${sha}`);
  const parentSha = commit.parents[0]?.sha;

  const prefix = `${env.CONTENT_DIR}/`;
  const paths = (commit.files ?? [])
    .map((f) => f.filename)
    .filter((p) => p.startsWith(prefix) && p.endsWith(".md"));
  if (paths.length === 0) throw new HttpError(400, "Nothing to roll back.");

  const author = { name: writer.name, email: writer.email };
  const message = `Roll back ${sha.slice(0, 7)}`;
  const restored: string[] = [];
  for (const path of paths) {
    const slug = path.slice(prefix.length, -3);
    const before = parentSha ? await getCurrentFile(env, repo, path, parentSha) : null;
    const onBranch = await getCurrentFile(env, repo, path);
    if (before) {
      await gh(env, `/repos/${repo}/contents/${path}`, {
        method: "PUT",
        body: commitPayload(env, {
          message,
          content: before.raw,
          branch: env.BRANCH,
          sha: onBranch?.sha,
          author,
        }),
      });
      await updateIndexEntry(env, slug, before.raw);
    } else if (onBranch) {
      await gh(env, `/repos/${repo}/contents/${path}`, {
        method: "DELETE",
        body: JSON.stringify({
          message,
          sha: onBranch.sha,
          branch: env.BRANCH,
          author,
          committer: botCommitter(env),
        }),
      });
      await removeIndexEntry(env, slug);
    }
    restored.push(slug);
  }
  await invalidateContent(env, writer.name, { keepIndex: true });
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "rollback",
    sha.slice(0, 7),
    `restored ${restored.join(", ")}`,
  );
  return { ok: true, restored };
}
