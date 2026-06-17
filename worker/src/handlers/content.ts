import { appendAudit } from "../audit";
import {
  automodActor,
  automodExemptTier,
  automodRevertCap,
  automodScore,
  decideAutoRevert,
} from "../automod";
import { utf8Bytes } from "../crypto";
import { type CommitItem, gh, ghHeaders } from "../github";
import { HttpError } from "../http";
import { resolve, type Writer } from "../identity";
import { invalidateContent, kvGetJson, kvPutJson } from "../kv";
import { autopatrol, bumpEditWar } from "../moderation";
import { notifyPendingReview } from "../notify";
import { commitPayload, getCurrentFile } from "../repo";
import { revertCommit } from "../revert";
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
export async function changeDetail(env: Env, sha: string): Promise<ChangeDetail> {
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
  const [prs, suppressions] = await Promise.all([
    gh<PrItem[]>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/pulls?state=open&base=${env.BRANCH}&per_page=50`,
    ),
    loadSuppressions(env),
  ]);
  const redact = makeRedactor(suppressions);
  const inSite = prs.filter((p) => isInSiteRef(p.head.ref));
  const prefix = `${env.CONTENT_DIR}/`;
  const pending = await Promise.all(
    inSite.map(async (p) => {
      const files = await prContentFiles(env, p.number);
      const { author, isAnon } = refIdentity(p.head.ref);
      return {
        number: p.number,
        author: redact.author(author),
        isAnon,
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
  tags: string[];
}

export interface EditOutcome {
  live: boolean;
  author: string;
  sha?: string;
  url?: string;
  prUrl?: string;
  autoReverted?: boolean; // the edit published, then the automoderator reverted it
}

type Prepared = { done: EditOutcome } | { ctx: EditContext; trusted: boolean };

// Everything that can *reject* an edit up front — so the caller can return a
// clean HTTP status (400/403/413/422) before any streaming starts. Returns a
// finished outcome for the no-op case, otherwise the context for runPublish.
export async function prepareEdit(
  env: Env,
  request: Request,
  body: EditBody,
): Promise<Prepared> {
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
    editorTier(env, writer.email, writer.key),
    getCurrentFile(env, repo, path),
  ]);

  // A `user/<login>` profile is editable only by its owner — the signed-in login
  // that matches the slug. Not even maintainers edit profile *content* (an
  // `ip_hash` can't own one, so anon is out too); maintainers moderate a bad
  // profile through the dedicated delete/rollback endpoints instead of rewriting
  // someone's page. Still the ordinary edit path (proof-of-work, PR); the owner
  // publishes their own page live.
  const owner = userPageOwner(slug);
  const isOwner =
    owner !== null && !writer.isAnon && writer.name.toLowerCase() === owner;
  if (owner !== null && !isOwner)
    throw new HttpError(403, "Only this profile's owner can edit it.");

  // Idempotent no-op: the live page already holds exactly this content — e.g. a
  // prior attempt merged but its bookkeeping failed and the user resubmitted, or
  // a submit with no actual change. Finish the (idempotent) bookkeeping, clean up
  // any leftover branch, and report success without opening an empty PR. Fast
  // enough to skip the progress stream.
  if (current && current.raw === content) {
    await invalidateContent(env, writer.name, { keepIndex: true });
    await updateIndexEntry(env, slug, content);
    await deleteBranch(env, repo, editBranch(writer, slug));
    return { done: { live: true, author: writer.name } };
  }

  const oldMeta = current ? frontmatter(current.raw) : {};
  enforceFieldPermissions(env, tier, oldMeta, frontmatter(content));
  const required = pageTier(env, oldMeta);

  const tags: string[] = [];
  // 3RR: trusted tiers are exempt; everyone else's rapid re-edits to one page
  // get the `edit-war` flag (review badge + revert-risk bump).
  if (
    TIER_RANK[tier] < TIER_RANK.extended &&
    (await bumpEditWar(env, writer.name, slug))
  )
    tags.push("edit-war");

  const ctx: EditContext = {
    repo,
    path,
    slug,
    content,
    summary,
    writer,
    tier,
    current,
    tags,
  };
  return { ctx, trusted: isOwner || TIER_RANK[tier] >= TIER_RANK[required] };
}

// `user/<login>` is a profile page owned by that GitHub login. Returns the login
// (lowercase, as SLUG_RE requires) or null for any slug outside the namespace.
export function userPageOwner(slug: string): string | null {
  const m = slug.match(/^user\/([^/]+)$/);
  return m ? m[1] : null;
}

// The mutating half, streamed: a progress milestone is emitted before each real
// step. Every edit becomes a PR; `trusted` only decides whether it's merged now
// or waits for review, so git's 3-way merge is the single conflict detector.
// Atomic-or-error — a step that throws aborts without a "done"; the deterministic
// branch (see openOrReusePr) lets a resubmit reconcile rather than duplicate.
export async function runPublish(
  env: Env,
  ctx: EditContext,
  trusted: boolean,
  emit: (progress: number, label: string) => void,
): Promise<EditOutcome> {
  emit(0.3, "Opening pull request");
  const pr = await openOrReusePr(env, ctx);
  if (trusted) {
    emit(0.65, "Publishing your change");
    const merged = await mergePr(
      env,
      ctx.repo,
      pr.number,
      ctx.summary || `Edit ${ctx.slug}`,
    );
    if (merged) {
      emit(0.9, "Going live");
      await finishPublish(env, ctx, pr.branch, merged.sha);
      // Post-publish safety net. Best-effort: a failure here leaves the edit live
      // (correct — it did publish) for a human to handle, never erroring the edit.
      let autoReverted = false;
      try {
        autoReverted = await autoModerate(env, ctx, merged.sha);
      } catch {}
      return {
        live: !autoReverted,
        sha: merged.sha,
        url: `https://github.com/${ctx.repo}/commit/${merged.sha}`,
        author: ctx.writer.name,
        autoReverted,
      };
    }
    // Trusted but not auto-mergeable (overlapping change): leave the PR open and
    // let it fall into the review queue — an expected outcome, not an error.
  }
  // A freshly-opened PR is a new review for the wiki's maintainers. Notify them
  // once (not on reuse/retry of an existing PR). Best-effort.
  if (pr.created) await notifyPendingReview(env, pr.number, ctx.slug, pr.htmlUrl);
  return { live: false, prUrl: pr.htmlUrl, author: ctx.writer.name };
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
): Promise<{ number: number; branch: string; htmlUrl: string; created: boolean }> {
  const { repo, path, slug, summary, writer, current, tags } = ctx;
  const author = writer.name;
  const branch = editBranch(writer, slug);

  const ref = await gh<{ object: { sha: string } } | undefined>(
    env,
    `/repos/${repo}/git/ref/heads/${branch}`,
    { allow404: true },
  );
  let fileSha: string | undefined;
  let branchRaw: string | undefined;
  if (ref) {
    const f = await getCurrentFile(env, repo, path, branch);
    fileSha = f?.sha;
    branchRaw = f?.raw;
  } else {
    const base = await gh<{ object: { sha: string } }>(
      env,
      `/repos/${repo}/git/ref/heads/${env.BRANCH}`,
    );
    const created = await gh<{ object: { sha: string } } | undefined>(
      env,
      `/repos/${repo}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
        allow422: true,
      },
    );
    if (created) {
      fileSha = current?.sha; // fresh branch tracks BRANCH, so the file sha matches
    } else {
      // A concurrent submit created the branch between our check and create.
      // Reconcile against it rather than 502.
      const f = await getCurrentFile(env, repo, path, branch);
      fileSha = f?.sha;
      branchRaw = f?.raw;
    }
  }
  // Skip the commit when the branch already holds this exact content — a resubmit
  // would otherwise stack an empty/duplicate commit (which also inflates trust).
  if (branchRaw !== ctx.content) {
    await gh(env, `/repos/${repo}/contents/${path}`, {
      method: "PUT",
      body: editCommit(env, ctx, branch, fileSha),
    });
  }

  const open = await gh<{ number: number; html_url: string }[]>(
    env,
    `/repos/${repo}/pulls?head=${env.REPO_OWNER}:${branch}&state=open`,
  );
  if (open.length)
    return {
      number: open[0].number,
      branch,
      htmlUrl: open[0].html_url,
      created: false,
    };

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
          (tags.length ? `\n\nTags: ${tags.join(", ")}` : ""),
      }),
    },
  );
  return { number: pr.number, branch, htmlUrl: pr.html_url, created: true };
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
  if (ctx.tags.length)
    await env.RATE_LIMIT?.put(`tag:${sha}`, JSON.stringify(ctx.tags));
  await deleteBranch(env, ctx.repo, branch);
}

const AUTOMOD_WINDOW_S = 86_400; // per-page revert-cap window (24h), like 3RR

// Merge `tag` into a commit's KV tag set (preserving any tags already stored),
// so RecentChanges shows it. Read-merge, not overwrite.
export async function addTag(env: Env, sha: string, tag: string): Promise<void> {
  if (!env.RATE_LIMIT) return;
  const raw = await env.RATE_LIMIT.get(`tag:${sha}`);
  const tags = raw ? (JSON.parse(raw) as string[]) : [];
  if (tags.includes(tag)) return;
  tags.push(tag);
  await env.RATE_LIMIT.put(`tag:${sha}`, JSON.stringify(tags));
}

// Automoderator: right after an edit auto-merges live, score it and — if it's
// high-confidence vandalism from an untrusted author and the per-page cap isn't
// hit — revert it through the shared reversible rollback path. Records the action
// (audit entry + public `auto-reverted` tag + an informative revert commit that
// tells the contributor how to contest) for recourse. Returns whether it acted.
async function autoModerate(env: Env, ctx: EditContext, sha: string): Promise<boolean> {
  const threshold = automodScore(env);
  if (threshold === null) return false; // disabled → no extra work

  const detail = await changeDetail(env, sha);
  const score = revertRisk({
    additions: detail.additions,
    deletions: detail.deletions,
    isAnon: ctx.writer.isAnon,
    created: detail.created.length > 0,
    tags: ctx.tags,
  });
  const capKey = `automod:${ctx.slug}`;
  const pageReverts = Number.parseInt((await env.RATE_LIMIT?.get(capKey)) ?? "0", 10);
  const decision = decideAutoRevert({
    score,
    threshold,
    tier: ctx.tier,
    exemptTier: automodExemptTier(env),
    pageReverts,
    cap: automodRevertCap(env),
  });
  if (!decision.revert) return false;

  const actor = automodActor();
  await revertCommit(
    env,
    sha,
    actor,
    `Auto-revert ${sha.slice(0, 7)} (${decision.reason}). ` +
      "False positive? Re-edit the page or raise it on the talk page.",
  );
  await env.RATE_LIMIT?.put(capKey, String(pageReverts + 1), {
    expirationTtl: AUTOMOD_WINDOW_S,
  });
  await addTag(env, sha, "auto-reverted");
  await appendAudit(
    env,
    ctx.repo,
    actor.name,
    actor.email,
    "auto-revert",
    ctx.slug,
    `risk ${score} · ${sha.slice(0, 7)} · ${ctx.writer.name}`,
  );
  return true;
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
      headers: await ghHeaders(env),
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
    editorTier(env, writer.email, writer.key),
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
