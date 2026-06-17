import { gh } from "./github";
import { removeIndexEntry, updateIndexEntry } from "./handlers/index-cache";
import { HttpError } from "./http";
import { invalidateContent } from "./kv";
import { autopatrol } from "./moderation";
import { keyFromCommitEmail } from "./notify";
import { botCommitter, commitPayload, getCurrentFile } from "./repo";
import type { Env } from "./types";

// Restore every content page a commit touched to its pre-commit (parent) state
// on the live branch, deleting pages the commit created. Lands as a new commit —
// history is preserved, so a revert can itself be rolled forward. Shared by the
// maintainer `/rollback` action and the automoderator; `by` is the committing
// identity (a maintainer, or the bot for an auto-revert) and the caller owns the
// audit entry. Throws 400 when the commit touched no content pages.
export async function revertCommit(
  env: Env,
  sha: string,
  by: { name: string; email: string },
  message: string = `Roll back ${sha.slice(0, 7)}`,
): Promise<{ restored: string[]; revertedKey: string | null }> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const commit = await gh<{
    parents: { sha: string }[];
    files?: { filename: string }[];
    commit?: { author?: { email?: string } };
  }>(env, `/repos/${repo}/commits/${sha}`);
  const parentSha = commit.parents[0]?.sha;
  // Who authored the reverted edit (for "you were reverted") — recovered from the
  // commit-author email, which encodes the provider-qualified identity key.
  const revertedKey = keyFromCommitEmail(commit.commit?.author?.email ?? "");

  const prefix = `${env.CONTENT_DIR}/`;
  const paths = (commit.files ?? [])
    .map((f) => f.filename)
    .filter((p) => p.startsWith(prefix) && p.endsWith(".md"));
  if (paths.length === 0) throw new HttpError(400, "Nothing to roll back.");

  const author = { name: by.name, email: by.email };
  const restored: string[] = [];
  for (const path of paths) {
    const slug = path.slice(prefix.length, -3);
    const before = parentSha ? await getCurrentFile(env, repo, path, parentSha) : null;
    const onBranch = await getCurrentFile(env, repo, path);
    if (before) {
      const res = await gh<{ commit: { sha: string } }>(
        env,
        `/repos/${repo}/contents/${path}`,
        {
          method: "PUT",
          body: commitPayload(env, {
            message,
            content: before.raw,
            branch: env.BRANCH,
            sha: onBranch?.sha,
            author,
          }),
        },
      );
      await updateIndexEntry(env, slug, before.raw);
      await autopatrol(env, "maintainer", res.commit.sha);
    } else if (onBranch) {
      const res = await gh<{ commit: { sha: string } }>(
        env,
        `/repos/${repo}/contents/${path}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            message,
            sha: onBranch.sha,
            branch: env.BRANCH,
            author,
            committer: botCommitter(env),
          }),
        },
      );
      await removeIndexEntry(env, slug);
      await autopatrol(env, "maintainer", res.commit.sha);
    }
    restored.push(slug);
  }
  // Bust the *reverted* author's trust cache — their accepted-edit count just
  // dropped. `revertedKey` is already provider-qualified; `by` is the committer.
  await invalidateContent(env, revertedKey ?? undefined, { keepIndex: true });
  return { restored, revertedKey };
}
