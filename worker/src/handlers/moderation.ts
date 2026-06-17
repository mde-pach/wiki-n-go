import { appendAudit } from "../audit";
import { type CommitItem, gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { invalidateContent } from "../kv";
import { autopatrol } from "../moderation";
import { appendModLog } from "../modlog";
import { notifyRevert } from "../notify";
import { botCommitter, commitPayload, getCurrentFile } from "../repo";
import { revertCommit } from "../revert";
import type { DeleteBody, Env, RestoreBody } from "../types";
import {
  type PatrolBody,
  type ReviewBody,
  type RollbackBody,
  SHA_RE,
  SLUG_RE,
  TAG_RE,
  type TagBody,
} from "../types";
import { addTag, isInSiteRef, refIdentity } from "./content";
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
  const writer = await requireMaintainer(env, request, "Patrolling");
  await env.RATE_LIMIT?.put(`patrol:${sha}`, "1");
  // Durable record so the patrol survives a no-DB restart (M11.3).
  await appendModLog(
    env,
    { type: "patrol", sha },
    {
      name: writer.name,
      email: writer.email,
    },
  );
  return { ok: true };
}

// Add a maintenance/review tag to a commit's KV tag set so it shows in
// RecentChanges + the curation toolbar. Maintainer-only; read-merges with any
// filter/3RR tags already stored (see addTag). Audited like the other actions.
export async function tag(
  env: Env,
  request: Request,
  body: TagBody,
): Promise<{ ok: true; tag: string }> {
  const sha = String(body.sha ?? "");
  const label = String(body.tag ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  if (!TAG_RE.test(label)) throw new HttpError(400, "Invalid tag.");
  const writer = await requireMaintainer(env, request, "Tagging");
  const tags = await addTag(env, sha, label);
  // Durable record of the full tag set so manual tags survive a restart (M11.3).
  if (tags.length)
    await appendModLog(
      env,
      { type: "tag", sha, tags },
      { name: writer.name, email: writer.email },
    );
  await appendAudit(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    writer.name,
    writer.email,
    "tag",
    sha.slice(0, 7),
    label,
  );
  return { ok: true, tag: label };
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
    // Bust the merged author's trust cache (their accepted-edit count just rose).
    // The branch ref carries the author; map it to the trust key (`gh:` for a
    // signed-in login, the bare pseudonym for anon).
    const merged = refIdentity(pr.head.ref);
    await invalidateContent(env, merged.isAnon ? merged.author : `gh:${merged.author}`);
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
// pre-commit state, deleting pages it created (see revertCommit). Overwrites any
// intervening edits to those pages (git keeps them); the dashboard confirms
// before calling. Maintainer-only — the same primitive the automoderator uses.
export async function rollback(
  env: Env,
  request: Request,
  body: RollbackBody,
): Promise<{ ok: true; restored: string[] }> {
  const sha = String(body.sha ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  const writer = await requireMaintainer(env, request, "Rollback");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const { restored, revertedKey } = await revertCommit(env, sha, {
    name: writer.name,
    email: writer.email,
  });
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "rollback",
    sha.slice(0, 7),
    `restored ${restored.join(", ")}`,
  );
  await notifyRevert(env, revertedKey, sha, restored);
  return { ok: true, restored };
}

// Restore one page to its content at a past revision — the History-row "restore
// this version" / "undo" action (undo passes the parent sha). Direct, lands as
// a new revision; maintainer-only like rollback.
export async function restore(
  env: Env,
  request: Request,
  body: RestoreBody,
): Promise<{ ok: true; slug: string }> {
  const slug = String(body.slug ?? "");
  const rev = String(body.rev ?? "");
  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (!SHA_RE.test(rev)) throw new HttpError(400, "Invalid revision.");
  const writer = await requireMaintainer(env, request, "Restore");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const [at, onBranch] = await Promise.all([
    getCurrentFile(env, repo, path, rev),
    getCurrentFile(env, repo, path),
  ]);
  if (!at) throw new HttpError(404, "That revision has no content for this page.");

  const res = await gh<{ commit: { sha: string } }>(
    env,
    `/repos/${repo}/contents/${path}`,
    {
      method: "PUT",
      body: commitPayload(env, {
        message: `Restore ${slug} to ${rev.slice(0, 7)}`,
        content: at.raw,
        branch: env.BRANCH,
        sha: onBranch?.sha,
        author: { name: writer.name, email: writer.email },
      }),
    },
  );
  await invalidateContent(env, writer.key, { keepIndex: true });
  await updateIndexEntry(env, slug, at.raw);
  await autopatrol(env, "maintainer", res.commit.sha);
  await appendAudit(
    env,
    repo,
    writer.name,
    writer.email,
    "restore",
    slug,
    rev.slice(0, 7),
  );
  return { ok: true, slug };
}

// Whether a page's latest revision has been patrolled — drives noindex-until-
// patrolled in the reader. Fails open (patrolled: true) with no KV or no
// commits, so a Worker/KV hiccup never deindexes the wiki.
export async function patrolStatus(
  env: Env,
  slug: string,
): Promise<{ patrolled: boolean; sha: string | null }> {
  if (!SLUG_RE.test(slug) || !env.RATE_LIMIT) return { patrolled: true, sha: null };
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const commits = await gh<CommitItem[]>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?path=${path}&sha=${env.BRANCH}&per_page=1`,
  );
  const sha = commits[0]?.sha ?? null;
  if (!sha) return { patrolled: true, sha: null };
  return { patrolled: Boolean(await env.RATE_LIMIT.get(`patrol:${sha}`)), sha };
}

// Delete a page (maintainer-only). The file is removed but stays in git history,
// so it's undeletable by restoring a pre-deletion revision from /history.
export async function deletePage(
  env: Env,
  request: Request,
  body: DeleteBody,
): Promise<{ ok: true; slug: string }> {
  const slug = String(body.slug ?? "");
  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  const writer = await requireMaintainer(env, request, "Deletion");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const current = await getCurrentFile(env, repo, path);
  if (!current) throw new HttpError(404, "No such page.");

  const res = await gh<{ commit: { sha: string } }>(
    env,
    `/repos/${repo}/contents/${path}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: `Delete ${slug}`,
        sha: current.sha,
        branch: env.BRANCH,
        author: { name: writer.name, email: writer.email },
        committer: botCommitter(env),
      }),
    },
  );
  await invalidateContent(env, writer.key, { keepIndex: true });
  await removeIndexEntry(env, slug);
  await autopatrol(env, "maintainer", res.commit.sha);
  await appendAudit(env, repo, writer.name, writer.email, "delete", slug);
  return { ok: true, slug };
}
