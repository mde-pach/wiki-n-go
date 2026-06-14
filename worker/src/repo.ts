import { toBase64 } from "./crypto";
import { gh } from "./github";
import type { Env } from "./types";

const BOT_COMMITTER_EMAIL = "bot@anon.invalid";
export const botCommitter = (env: Env) => ({
  name: `${env.REPO_NAME} bot`,
  email: BOT_COMMITTER_EMAIL,
});

export interface CommitArgs {
  message: string;
  content: string;
  branch: string;
  author: { name: string; email: string };
  sha?: string;
}

export function commitPayload(env: Env, args: CommitArgs): string {
  return JSON.stringify({
    message: args.message,
    content: toBase64(args.content),
    branch: args.branch,
    sha: args.sha,
    author: args.author,
    committer: botCommitter(env),
  });
}

// Commit a repo-root JSON list (bans / trusted-editors / suppressions) in one
// PUT. Callers have already read the file to mutate the list, so they pass the
// blob `sha` they hold — no second fetch. Serializes pretty + trailing newline,
// the shape every such file uses, so the moderation handlers share one write
// path instead of near-identical copies.
export async function commitJson(
  env: Env,
  path: string,
  items: unknown[],
  message: string,
  author: { name: string; email: string },
  sha: string | undefined,
): Promise<void> {
  await gh(env, `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${path}`, {
    method: "PUT",
    body: commitPayload(env, {
      message,
      content: `${JSON.stringify(items, null, 2)}\n`,
      branch: env.BRANCH,
      sha,
      author,
    }),
  });
}

// Current file on the live branch: blob sha (for the next commit) + raw text
// (for protection / field checks). Null when the page is new.
export async function getCurrentFile(
  env: Env,
  repo: string,
  path: string,
  ref: string = env.BRANCH,
): Promise<{ sha: string; raw: string } | null> {
  const file = await gh<{ sha: string; content: string } | undefined>(
    env,
    `/repos/${repo}/contents/${path}?ref=${ref}`,
    { allow404: true },
  );
  if (!file) return null;
  const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) =>
    c.charCodeAt(0),
  );
  return { sha: file.sha, raw: new TextDecoder().decode(bytes) };
}
