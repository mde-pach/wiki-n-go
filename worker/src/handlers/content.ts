import { utf8Bytes } from "../crypto";
import { type CommitItem, gh, ghHeaders } from "../github";
import { HttpError } from "../http";
import { resolve, type Writer } from "../identity";
import { invalidateContent, kvGetJson, kvPutJson } from "../kv";
import { autopatrol, bumpEditWar, runFilters } from "../moderation";
import { commitPayload, getCurrentFile } from "../repo";
import { revertRisk } from "../risk";
import { loadSuppressions, makeRedactor } from "../suppression";
import {
  editorTier,
  enforceFieldPermissions,
  frontmatter,
  pageTier,
  TIER_RANK,
  type Tier,
} from "../trust";
import type { Env } from "../types";
import {
  type EditBody,
  MAX_CONTENT_BYTES,
  type MoveBody,
  SHA_RE,
  SLUG_RE,
} from "../types";
import { updateIndexEntry } from "./index-cache";

export async function history(env: Env, slug: string) {
  if (!SLUG_RE.test(slug)) return { revisions: [] };
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const [commits, suppressions] = await Promise.all([
    gh<CommitItem[]>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?path=${path}&sha=${env.BRANCH}&per_page=50`,
    ),
    loadSuppressions(env),
  ]);
  const redact = makeRedactor(suppressions);
  return {
    revisions: commits.map((c) => ({
      sha: c.sha,
      parent: c.parents[0]?.sha ?? null,
      author: redact.author(c.commit.author.name),
      date: c.commit.author.date,
      message: redact.revisionSummary(c.sha, c.commit.message.split("\n")[0]),
    })),
  };
}

interface ChangeDetail {
  slugs: string[];
  created: string[]; // slugs this commit added (drives the New-pages queue)
  additions: number;
  deletions: number;
}

interface OutChange extends ChangeDetail {
  sha: string;
  author: string;
  isAnon: boolean;
  date: string;
  message: string;
  patrolled: boolean;
  tags: string[];
  risk: number;
}

// Per-commit files + byte stats. A commit is immutable, so cache it forever.
async function changeDetail(env: Env, sha: string): Promise<ChangeDetail> {
  const key = `change:${sha}`;
  const cached = await kvGetJson<ChangeDetail>(env, key);
  if (cached) return { ...cached, created: cached.created ?? [] };
  const d = await gh<{
    stats?: { additions: number; deletions: number };
    files?: { filename: string; status?: string }[];
  }>(env, `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits/${sha}`);
  const prefix = `${env.CONTENT_DIR}/`;
  const pageFiles = (d.files ?? []).filter(
    (f) => f.filename.startsWith(prefix) && f.filename.endsWith(".md"),
  );
  const toSlug = (f: { filename: string }) => f.filename.slice(prefix.length, -3);
  const detail: ChangeDetail = {
    slugs: pageFiles.map(toSlug),
    created: pageFiles.filter((f) => f.status === "added").map(toSlug),
    additions: d.stats?.additions ?? 0,
    deletions: d.stats?.deletions ?? 0,
  };
  await kvPutJson(env, key, detail);
  return detail;
}

export async function listChanges(
  env: Env,
  limitStr: string,
): Promise<{ changes: OutChange[] }> {
  const limit = Math.min(Math.max(Number.parseInt(limitStr, 10) || 30, 1), 100);
  const [commits, suppressions] = await Promise.all([
    gh<CommitItem[]>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?path=${env.CONTENT_DIR}&sha=${env.BRANCH}&per_page=${limit}`,
    ),
    loadSuppressions(env),
  ]);
  const redact = makeRedactor(suppressions);
  const changes = await Promise.all(
    commits.map(async (c) => {
      const [detail, patrolled, tags] = await Promise.all([
        changeDetail(env, c.sha),
        env.RATE_LIMIT?.get(`patrol:${c.sha}`).then(Boolean) ?? Promise.resolve(false),
        env.RATE_LIMIT?.get(`tag:${c.sha}`).then((t) =>
          t ? (JSON.parse(t) as string[]) : [],
        ) ?? Promise.resolve([] as string[]),
      ]);
      const author = c.commit.author.name;
      const isAnon = author.startsWith("anon-");
      return {
        sha: c.sha,
        author: redact.author(author),
        isAnon,
        date: c.commit.author.date,
        message: redact.revisionSummary(c.sha, c.commit.message.split("\n")[0]),
        patrolled,
        tags,
        risk: revertRisk({
          additions: detail.additions,
          deletions: detail.deletions,
          isAnon,
          created: detail.created.length > 0,
          tags,
        }),
        ...detail,
      };
    }),
  );
  return { changes };
}

interface OutPending {
  number: number;
  author: string;
  isAnon: boolean;
  slug: string;
  title: string;
  createdAt: string;
  additions: number;
  deletions: number;
}

interface PrItem {
  number: number;
  title: string;
  created_at: string;
  head: { ref: string };
}

interface PrFile {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

// In-site PR branches are namespaced by the author: `anon-<hash>/…` for
// anonymous edits, `gh-<login>/…` for signed-in ones. The first segment carries
// the identity; `gh-` is stripped to the bare login for display + trust.
export function isInSiteRef(ref: string): boolean {
  return ref.startsWith("anon-") || ref.startsWith("gh-");
}

export function refIdentity(ref: string): { author: string; isAnon: boolean } {
  const seg = ref.split("/")[0];
  return seg.startsWith("gh-")
    ? { author: seg.slice(3), isAnon: false }
    : { author: seg, isAnon: true };
}

async function prContentFiles(env: Env, number: number): Promise<PrFile[]> {
  const files = await gh<PrFile[]>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/pulls/${number}/files`,
  );
  const prefix = `${env.CONTENT_DIR}/`;
  return files.filter(
    (f) => f.filename.startsWith(prefix) && f.filename.endsWith(".md"),
  );
}

export async function listPending(env: Env): Promise<{ pending: OutPending[] }> {
  const prs = await gh<PrItem[]>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/pulls?state=open&base=${env.BRANCH}&per_page=50`,
  );
  const inSite = prs.filter((p) => isInSiteRef(p.head.ref));
  const prefix = `${env.CONTENT_DIR}/`;
  const pending = await Promise.all(
    inSite.map(async (p) => {
      const files = await prContentFiles(env, p.number);
      return {
        number: p.number,
        ...refIdentity(p.head.ref),
        slug: files[0] ? files[0].filename.slice(prefix.length, -3) : "",
        title: p.title,
        createdAt: p.created_at,
        additions: files.reduce((a, f) => a + f.additions, 0),
        deletions: files.reduce((a, f) => a + f.deletions, 0),
      };
    }),
  );
  return { pending };
}

export async function pendingDiff(
  env: Env,
  numberStr: string,
): Promise<{ patch: string | null }> {
  const number = Number.parseInt(numberStr, 10);
  if (!Number.isInteger(number) || number <= 0)
    throw new HttpError(400, "Invalid pull request.");
  const files = await prContentFiles(env, number);
  return { patch: files[0]?.patch ?? null };
}

export async function diff(env: Env, slug: string, base: string, head: string) {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "Invalid slug.");
  if (!SHA_RE.test(base) || !SHA_RE.test(head)) {
    throw new HttpError(400, "Invalid revision.");
  }
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const cmp = await gh<{ files?: { filename: string; patch?: string }[] }>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/compare/${base}...${head}`,
  );
  return { patch: cmp.files?.find((f) => f.filename === path)?.patch ?? null };
}

interface EditContext {
  repo: string;
  path: string;
  slug: string;
  content: string;
  summary: string;
  writer: Writer;
  tier: Tier;
  current: { sha: string; raw: string } | null;
  verdict: Awaited<ReturnType<typeof runFilters>>;
}

export async function proposeEdit(env: Env, request: Request, body: EditBody) {
  const slug = String(body.slug ?? "");
  const content = String(body.content ?? "");
  const summary = body.summary ? String(body.summary) : "";

  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (utf8Bytes(content) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Content too large.");

  const writer = await resolve(env, request, { token: body.token, path: slug });
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;

  const [tier, current] = await Promise.all([
    editorTier(env, writer.name, writer.email),
    getCurrentFile(env, repo, path),
  ]);
  // Idempotent no-op: the live page already holds exactly this content — e.g. a
  // prior attempt merged but its bookkeeping failed and the user resubmitted, or
  // a submit with no actual change. Finish the (idempotent) bookkeeping, clean up
  // any leftover branch, and report success without opening an empty PR.
  if (current && current.raw === content) {
    await invalidateContent(env, writer.name, { keepIndex: true });
    await updateIndexEntry(env, slug, content);
    await deleteBranch(env, repo, editBranch(writer, slug));
    return { live: true, author: writer.name };
  }

  const oldMeta = current ? frontmatter(current.raw) : {};
  enforceFieldPermissions(env, tier, oldMeta, frontmatter(content));
  const required = pageTier(env, oldMeta);

  const verdict = await runFilters(env, tier, current?.raw ?? "", content);
  if (verdict.action === "disallow")
    throw new HttpError(422, verdict.message ?? "This edit was blocked by a filter.");

  // 3RR: trusted tiers are exempt; everyone else's rapid re-edits to one page
  // get the `edit-war` flag (review badge + revert-risk bump).
  if (
    TIER_RANK[tier] < TIER_RANK.extended &&
    (await bumpEditWar(env, writer.name, slug))
  )
    verdict.tags.push("edit-war");

  const ctx: EditContext = {
    repo,
    path,
    slug,
    content,
    summary,
    writer,
    tier,
    current,
    verdict,
  };

  // Every edit becomes a PR; trust only decides whether it's merged now or waits
  // for review. So git's 3-way merge is the single conflict detector for both
  // paths. Publishing is treated as one atomic operation: if the merge or its
  // bookkeeping can't complete, we throw rather than report a half-done success —
  // the deterministic branch (see openOrReusePr) makes a resubmit converge.
  const pr = await openOrReusePr(env, ctx);
  if (TIER_RANK[tier] >= TIER_RANK[required]) {
    const merged = await mergePr(env, repo, pr.number, summary || `Edit ${slug}`);
    if (merged) {
      await finishPublish(env, ctx, pr.branch, merged.sha);
      return {
        live: true,
        sha: merged.sha,
        url: `https://github.com/${repo}/commit/${merged.sha}`,
        author: writer.name,
      };
    }
    // Trusted but not auto-mergeable (overlapping change): leave the PR open and
    // let it fall into the review queue — an expected outcome, not an error.
  }
  return { live: false, prUrl: pr.htmlUrl, author: writer.name };
}

// One branch per author+slug (slug slashes kept so they can't collide), so all of
// one editor's pending changes to a page live in a single PR — and a retry after
// a partial failure reconciles that branch/PR instead of stacking a duplicate.
function editBranch(writer: Writer, slug: string): string {
  return `${writer.isAnon ? writer.name : `gh-${writer.name}`}/${slug}`;
}

function editCommit(env: Env, ctx: EditContext, branch: string, sha?: string): string {
  return commitPayload(env, {
    message: ctx.summary || `Edit ${ctx.slug}`,
    content: ctx.content,
    branch,
    sha,
    author: { name: ctx.writer.name, email: ctx.writer.email },
  });
}

async function deleteBranch(env: Env, repo: string, branch: string): Promise<void> {
  await gh(env, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "DELETE",
    allow404: true,
  });
}

// Commit the edit to the author's deterministic branch (creating it if absent,
// updating it if a prior edit/attempt left it) and return that branch's open PR,
// opening one only if none exists yet. The branch prefix carries the author so
// the review queue can attribute it (see refIdentity).
async function openOrReusePr(
  env: Env,
  ctx: EditContext,
): Promise<{ number: number; branch: string; htmlUrl: string }> {
  const { repo, path, slug, summary, writer, current, verdict } = ctx;
  const author = writer.name;
  const branch = editBranch(writer, slug);

  const ref = await gh<{ object: { sha: string } } | undefined>(
    env,
    `/repos/${repo}/git/ref/heads/${branch}`,
    { allow404: true },
  );
  let fileSha: string | undefined;
  if (ref) {
    fileSha = (await getCurrentFile(env, repo, path, branch))?.sha;
  } else {
    const base = await gh<{ object: { sha: string } }>(
      env,
      `/repos/${repo}/git/ref/heads/${env.BRANCH}`,
    );
    await gh(env, `/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
    });
    fileSha = current?.sha; // fresh branch tracks BRANCH, so the file sha matches
  }
  await gh(env, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: editCommit(env, ctx, branch, fileSha),
  });

  const open = await gh<{ number: number; html_url: string }[]>(
    env,
    `/repos/${repo}/pulls?head=${env.REPO_OWNER}:${branch}&state=open`,
  );
  if (open.length) return { number: open[0].number, branch, htmlUrl: open[0].html_url };

  const pr = await gh<{ number: number; html_url: string }>(
    env,
    `/repos/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title:
          summary ||
          `${writer.isAnon ? "Anonymous edit" : `Edit by ${author}`}: ${slug}`,
        head: branch,
        base: env.BRANCH,
        body:
          `Proposed in-site by \`${author}\`.` +
          (verdict.tags.length ? `\n\nFilter tags: ${verdict.tags.join(", ")}` : ""),
      }),
    },
  );
  return { number: pr.number, branch, htmlUrl: pr.html_url };
}

// Post-merge bookkeeping for a clean auto-merge. Every step is idempotent, so a
// resubmit that re-reaches it (via the no-op path) after a partial failure
// converges. The branch delete is last — purely cosmetic cleanup.
async function finishPublish(
  env: Env,
  ctx: EditContext,
  branch: string,
  sha: string,
): Promise<void> {
  await invalidateContent(env, ctx.writer.name, { keepIndex: true });
  await updateIndexEntry(env, ctx.slug, ctx.content);
  await autopatrol(env, ctx.tier, sha);
  if (ctx.verdict.tags.length)
    await env.RATE_LIMIT?.put(`tag:${sha}`, JSON.stringify(ctx.verdict.tags));
  await deleteBranch(env, ctx.repo, branch);
}

// Squash-merge a PR. Returns the new commit, or null when GitHub reports it
// isn't mergeable (405 conflict / 409 base moved) — the one expected non-error
// outcome, so it bypasses gh()'s throw-on-non-2xx.
async function mergePr(
  env: Env,
  repo: string,
  number: number,
  title: string,
): Promise<{ sha: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${number}/merge`,
    {
      method: "PUT",
      headers: ghHeaders(env),
      body: JSON.stringify({ merge_method: "squash", commit_title: title }),
    },
  );
  if (res.ok) return (await res.json()) as { sha: string };
  if (res.status === 405 || res.status === 409) return null;
  throw new HttpError(502, `GitHub ${res.status}: ${await res.text()}`);
}

// Move/rename a page: copy it to the new slug and leave a redirect stub behind,
// so inbound links keep working (Wikipedia's move-leaves-a-redirect). Gated to
// whoever may edit the source page; commits directly (no PR fallback).
export async function movePage(env: Env, request: Request, body: MoveBody) {
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const summary = body.summary ? String(body.summary) : "";
  if (!SLUG_RE.test(from) || from.includes(".."))
    throw new HttpError(400, "Invalid source slug.");
  if (!SLUG_RE.test(to) || to.includes(".."))
    throw new HttpError(400, "Invalid target slug.");
  if (from === to) throw new HttpError(400, "Source and target are the same.");

  const writer = await resolve(env, request, { token: body.token, path: from });
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const fromPath = `${env.CONTENT_DIR}/${from}.md`;
  const toPath = `${env.CONTENT_DIR}/${to}.md`;

  const [tier, current, target] = await Promise.all([
    editorTier(env, writer.name, writer.email),
    getCurrentFile(env, repo, fromPath),
    getCurrentFile(env, repo, toPath),
  ]);
  if (!current) throw new HttpError(404, "Page not found.");
  if (target) throw new HttpError(422, "A page already exists at the target.");
  const required = pageTier(env, frontmatter(current.raw));
  if (TIER_RANK[tier] < TIER_RANK[required])
    throw new HttpError(403, `Moving this page requires ${required} access.`);

  const author = { name: writer.name, email: writer.email };
  await gh(env, `/repos/${repo}/contents/${toPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: summary || `Move ${from} → ${to}`,
      content: current.raw,
      branch: env.BRANCH,
      author,
    }),
  });
  const stub = `---\nredirect: ${to}\n---\n\n#REDIRECT [[${to}]]\n`;
  await gh(env, `/repos/${repo}/contents/${fromPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: `Redirect ${from} → ${to}`,
      content: stub,
      branch: env.BRANCH,
      sha: current.sha,
      author,
    }),
  });

  await invalidateContent(env, writer.name);
  return { ok: true, from, to };
}
