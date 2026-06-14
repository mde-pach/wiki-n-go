import { type CommitItem, gh } from "../github";
import { HttpError } from "../http";
import { cached } from "../kv";
import { loadSuppressions, makeRedactor } from "../suppression";
import { editorTier, type Tier } from "../trust";
import type { Env } from "../types";
import { changeDetail } from "./content";

// GitHub login grammar (also matches an `anon-<hash>` pseudonym).
const AUTHOR_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export interface Contribution {
  sha: string;
  date: string;
  message: string;
  slugs: string[];
  created: string[];
  additions: number;
  deletions: number;
}

export interface ContributionsResult {
  login: string;
  tier: Tier;
  isAnon: boolean;
  contributions: Contribution[];
}

const CONTRIB_TTL_MS = 300_000; // 5 min, matching the link-graph cache window

// Per-author edit history for a profile page: every commit the identity authored
// on the live branch (direct or merged-PR — both land as commits), newest first.
// Read-only; KV-cached like /link-graph so a busy profile doesn't hammer GitHub.
export function contributions(env: Env, author: string): Promise<ContributionsResult> {
  if (!AUTHOR_RE.test(author)) throw new HttpError(400, "Invalid user.");
  return cached(env, `contrib:${author}`, CONTRIB_TTL_MS, () => build(env, author));
}

async function build(env: Env, author: string): Promise<ContributionsResult> {
  const isAnon = author.startsWith("anon-");
  // Anon commits author as `<name>@anon.invalid`; a login's commits map to the
  // account via its no-reply email, which GitHub's `author` filter resolves from
  // the username — so the login itself works as the email-or-username filter.
  const email = isAnon ? `${author}@anon.invalid` : author;
  // Provider-qualified key for the maintainer/tier check (display only here): an
  // anon author is its own key; a bare login is treated as the GitHub identity.
  const key = isAnon ? author : `gh:${author}`;
  const [commits, tier, suppressions] = await Promise.all([
    gh<CommitItem[]>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?author=${encodeURIComponent(
        author,
      )}&sha=${env.BRANCH}&per_page=50`,
    ),
    editorTier(env, email, key),
    loadSuppressions(env),
  ]);
  const redact = makeRedactor(suppressions);
  const detailed = await Promise.all(
    commits.map(async (c) => {
      const detail = await changeDetail(env, c.sha);
      if (detail.slugs.length === 0) return null; // non-content commit (config, etc.)
      return {
        sha: c.sha,
        date: c.commit.author.date,
        message: redact.revisionSummary(c.sha, c.commit.message.split("\n")[0]),
        slugs: detail.slugs,
        created: detail.created,
        additions: detail.additions,
        deletions: detail.deletions,
      };
    }),
  );
  const list = detailed.filter((c): c is Contribution => c !== null);
  return { login: author, tier, isAnon, contributions: list };
}
