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
