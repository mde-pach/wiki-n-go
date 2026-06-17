import { isBanned } from "../bans";
import { utf8Bytes } from "../crypto";
import { gh } from "../github";
import { HttpError } from "../http";
import { resolve, type Writer } from "../identity";
import { invalidateContent } from "../kv";
import { commitPayload, getCurrentFile, repoSlug } from "../repo";
import { editorTier, frontmatter, pageTier, TIER_RANK, type Tier } from "../trust";
import type { Env, MergeBody, MoveBody, SplitBody } from "../types";
import { MAX_CONTENT_BYTES, SLUG_RE } from "../types";
import { userPageOwner } from "./content";

// Merge and split are content-lifecycle operations built from the same pieces as
// move (gated direct commits + a redirect stub) and gated like a normal edit:
// the anonymous path clears the bot check + bans + the rate limit via resolve(),
// and trust tiers decide whether the caller may touch the affected pages
// (insufficient tier → 403, as with move).
// The client composes the page bodies — including `merged_from`/`split_from`
// frontmatter — so the Worker only validates, gates, and commits.

function assertSlug(slug: string, label: string): void {
  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, `Invalid ${label} slug.`);
  // Profiles are owner-only single pages; structural ops don't apply.
  if (userPageOwner(slug) !== null)
    throw new HttpError(403, "Profile pages can't be merged or split.");
}

function assertSize(content: string): void {
  if (utf8Bytes(content) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Content too large.");
}

function higherTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

function requireTier(tier: Tier, required: Tier, action: string): void {
  if (TIER_RANK[tier] < TIER_RANK[required])
    throw new HttpError(403, `${action} requires ${required} access.`);
}

function redirectStub(to: string): string {
  return `---\nredirect: ${to}\n---\n\n#REDIRECT [[${to}]]\n`;
}

async function assertUnbannedSource(env: Env, writer: Writer, from: string) {
  if (await isBanned(env, writer.key, from))
    throw new HttpError(
      403,
      writer.isAnon ? "This source is blocked." : "This account is blocked.",
    );
}

// Fold `from` into `to`: write the composed merged content to `to`, then leave a
// redirect at `from` so inbound links keep working. `to` is committed first so a
// mid-operation failure can never lose the folded-in content.
export async function mergePages(env: Env, request: Request, body: MergeBody) {
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const content = String(body.content ?? "");
  const summary = body.summary ? String(body.summary) : "";
  assertSlug(from, "source");
  assertSlug(to, "target");
  if (from === to) throw new HttpError(400, "Source and target are the same.");
  assertSize(content);

  const writer = await resolve(env, request, { token: body.token, path: to });
  // resolve() gates the ban on the target; merge also mutates the source, so a
  // partial ban on the `from` subtree must block folding it away too.
  await assertUnbannedSource(env, writer, from);
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const fromPath = `${env.CONTENT_DIR}/${from}.md`;
  const toPath = `${env.CONTENT_DIR}/${to}.md`;

  const [tier, source, target] = await Promise.all([
    editorTier(env, writer.email, writer.key),
    getCurrentFile(env, repo, fromPath),
    getCurrentFile(env, repo, toPath),
  ]);
  if (!source) throw new HttpError(404, "Source page not found.");
  if (!target) throw new HttpError(404, "Target page not found.");
  requireTier(
    tier,
    higherTier(
      pageTier(env, frontmatter(source.raw)),
      pageTier(env, frontmatter(target.raw)),
    ),
    "Merging these pages",
  );

  const author = { name: writer.name, email: writer.email };
  await gh(env, `/repos/${repo}/contents/${toPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: summary || `Merge ${from} into ${to}`,
      content,
      branch: env.BRANCH,
      sha: target.sha,
      author,
    }),
  });
  await gh(env, `/repos/${repo}/contents/${fromPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: `Redirect ${from} → ${to} (merged)`,
      content: redirectStub(to),
      branch: env.BRANCH,
      sha: source.sha,
      author,
    }),
  });

  await invalidateContent(env, writer.key);
  return { ok: true, from, to };
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
  const repo = repoSlug(env);
  const fromPath = `${env.CONTENT_DIR}/${from}.md`;
  const toPath = `${env.CONTENT_DIR}/${to}.md`;

  const [tier, current, target] = await Promise.all([
    editorTier(env, writer.email, writer.key),
    getCurrentFile(env, repo, fromPath),
    getCurrentFile(env, repo, toPath),
  ]);
  if (!current) throw new HttpError(404, "Page not found.");
  if (target) throw new HttpError(422, "A page already exists at the target.");
  requireTier(tier, pageTier(env, frontmatter(current.raw)), "Moving this page");

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
  await gh(env, `/repos/${repo}/contents/${fromPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: `Redirect ${from} → ${to}`,
      content: redirectStub(to),
      branch: env.BRANCH,
      sha: current.sha,
      author,
    }),
  });

  await invalidateContent(env, writer.key);
  return { ok: true, from, to };
}

// Carve a section of `from` into a brand-new page `to`: create `to` from the
// composed section first (nothing to lose if the second write fails), then write
// the trimmed source back. The target must not already exist.
export async function splitPage(env: Env, request: Request, body: SplitBody) {
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const fromContent = String(body.fromContent ?? "");
  const toContent = String(body.toContent ?? "");
  const summary = body.summary ? String(body.summary) : "";
  assertSlug(from, "source");
  assertSlug(to, "target");
  if (from === to) throw new HttpError(400, "Source and target are the same.");
  assertSize(fromContent);
  assertSize(toContent);

  const writer = await resolve(env, request, { token: body.token, path: to });
  // resolve() gates the ban on the target; split also trims the source, so a
  // partial ban on the `from` subtree must block carving content out of it.
  await assertUnbannedSource(env, writer, from);
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const fromPath = `${env.CONTENT_DIR}/${from}.md`;
  const toPath = `${env.CONTENT_DIR}/${to}.md`;

  const [tier, source, target] = await Promise.all([
    editorTier(env, writer.email, writer.key),
    getCurrentFile(env, repo, fromPath),
    getCurrentFile(env, repo, toPath),
  ]);
  if (!source) throw new HttpError(404, "Source page not found.");
  if (target) throw new HttpError(422, "A page already exists at the target.");
  // Edit rights on the source, and creation rights for the new page (the
  // default tier of a page with no protection).
  requireTier(
    tier,
    higherTier(pageTier(env, frontmatter(source.raw)), pageTier(env, {})),
    "Splitting this page",
  );

  const author = { name: writer.name, email: writer.email };
  await gh(env, `/repos/${repo}/contents/${toPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: summary || `Split ${to} out of ${from}`,
      content: toContent,
      branch: env.BRANCH,
      author,
    }),
  });
  await gh(env, `/repos/${repo}/contents/${fromPath}`, {
    method: "PUT",
    body: commitPayload(env, {
      message: `Trim section split to ${to}`,
      content: fromContent,
      branch: env.BRANCH,
      sha: source.sha,
      author,
    }),
  });

  await invalidateContent(env, writer.key);
  return { ok: true, from, to };
}
