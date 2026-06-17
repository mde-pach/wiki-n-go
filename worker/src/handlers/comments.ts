import { utf8Bytes } from "../crypto";
import { ghGraphQL } from "../github";
import { HttpError } from "../http";
import { resolve, type Writer } from "../identity";
import { cached } from "../kv";
import { mentionFor, notifyByEmail } from "../notify";
import { loadSuppressions, makeRedactor, type Redactor } from "../suppression";
import type { Env } from "../types";
import {
  type CommentBody,
  MAX_CONTENT_BYTES,
  MAX_TITLE_LEN,
  NODE_ID_RE,
  SLUG_RE,
  type TopicBody,
} from "../types";

interface OutComment {
  id: string;
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  bodyHtml: string;
  createdAt: string;
  url: string;
  replyTo: string | null;
}

interface OutTopic {
  id: string;
  title: string;
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  createdAt: string;
  replyCount: number;
  lastAt: string;
}

interface RawComment {
  id: string;
  body: string;
  bodyHTML: string;
  createdAt: string;
  url: string;
  author: { login: string; avatarUrl: string } | null;
}

interface RawTopic {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { login: string; avatarUrl: string } | null;
  comments: { totalCount: number; nodes: { createdAt: string }[] };
}

const ANON_MARKER = /<!--\s*anon:([a-z0-9-]+)\s*-->/;
// Signed-in attribution: `<!-- gh:<login>|<avatarUrl> -->`. The bot posts the
// comment; this marker tells the renderer to show the signed-in user instead.
const GH_MARKER = /<!--\s*gh:([A-Za-z0-9-]+)\|([^\s>]*)\s*-->/;
// Wikigit-account attribution: `<!-- wg:<sub>|<avatarUrl>|<handle> -->`. The sub
// (not the handle) is the routing key, so a notification reaches the right
// account and we never mistake a wg handle for a GitHub login.
const WG_MARKER = /<!--\s*wg:([^|>]+)\|([^|>]*)\|([^>]*?)\s*-->/;
const REPLY_MARKER = /<!--\s*reply-to:([A-Za-z0-9_=-]+)\s*-->/;

// The identity marker embedded in a Discussion body for in-site posts.
function identityMarker(writer: Writer): string {
  if (writer.isAnon) return `<!-- anon:${writer.name} -->`;
  if (writer.key.startsWith("wg:"))
    return `<!-- wg:${writer.key.slice(3)}|${writer.avatar ?? ""}|${writer.name} -->`;
  return `<!-- gh:${writer.name}|${writer.avatar ?? ""} -->`;
}

// The provider-qualified identity key of a comment's author, recovered from its
// marker — for routing a reply notification. Null when unmarked (a legacy or
// bot-authored comment with no in-site identity to reach).
export function participantKeyOf(body: string): string | null {
  const anon = body.match(ANON_MARKER);
  if (anon) return anon[1]; // `anon-<hash>` is itself the key
  const wg = body.match(WG_MARKER);
  if (wg) return `wg:${wg[1]}`;
  const gh = body.match(GH_MARKER);
  if (gh) return `gh:${gh[1]}`;
  return null;
}

// One titled GitHub Discussion per talk topic, namespaced so a page's topics are
// found by title prefix and never collide with other discussions.
const topicPrefix = (slug: string) => `talk:${slug} · `;

const LIST_TOPICS = `query($q:String!){
  search(query:$q, type:DISCUSSION, first:50){ nodes{ ... on Discussion {
    id title body createdAt
    author{ login avatarUrl }
    comments(last:1){ totalCount nodes{ createdAt } }
  } } }
}`;

const GET_THREAD = `query($id:ID!){
  node(id:$id){ ... on Discussion {
    id title body bodyHTML url createdAt
    author{ login avatarUrl }
    comments(first:100){ nodes{ id body bodyHTML createdAt url author{ login avatarUrl } } }
  } }
}`;

const CREATE_DISCUSSION = `mutation($repo:ID!,$cat:ID!,$title:String!,$body:String!){
  createDiscussion(input:{repositoryId:$repo,categoryId:$cat,title:$title,body:$body}){ discussion{ id } }
}`;

const ADD_COMMENT = `mutation($d:ID!,$body:String!){
  addDiscussionComment(input:{discussionId:$d,body:$body}){ comment{ id } }
}`;

const DISCUSSION_CTX_TTL_MS = 86_400_000; // repo id is immutable; categories rarely change
const DISCUSSION_CTX_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    id discussionCategories(first:25){ nodes{ id name } }
  }
}`;

// Pick the discussion category by name (case-insensitive), falling back to the
// first category so a repo without the configured one still works.
export function pickCategory(
  nodes: { id: string; name: string }[],
  name: string,
): string | null {
  const want = name.toLowerCase();
  return nodes.find((c) => c.name.toLowerCase() === want)?.id ?? nodes[0]?.id ?? null;
}

// Repo node id + target discussion category id. Derived from the repo + category
// name and cached (env IDs override, for anyone who'd rather pin them).
async function discussionContext(
  env: Env,
): Promise<{ repoId: string; categoryId: string }> {
  if (env.REPO_ID && env.DISCUSSION_CATEGORY_ID)
    return { repoId: env.REPO_ID, categoryId: env.DISCUSSION_CATEGORY_ID };
  return cached(env, "meta:discussion-ctx", DISCUSSION_CTX_TTL_MS, async () => {
    const data = await ghGraphQL<{
      repository: {
        id: string;
        discussionCategories: { nodes: { id: string; name: string }[] };
      };
    }>(env, DISCUSSION_CTX_QUERY, { owner: env.REPO_OWNER, name: env.REPO_NAME });
    const categoryId = pickCategory(
      data.repository.discussionCategories.nodes,
      env.DISCUSSION_CATEGORY ?? "General",
    );
    if (!categoryId) throw new HttpError(502, "No discussion categories on this repo.");
    return { repoId: data.repository.id, categoryId };
  });
}

export function authorOf(
  body: string,
  author: { login: string; avatarUrl: string } | null,
) {
  const anon = body.match(ANON_MARKER);
  if (anon) return { author: anon[1], isAnon: true, avatarUrl: null };
  const wg = body.match(WG_MARKER);
  if (wg) return { author: wg[3].trim(), isAnon: false, avatarUrl: wg[2] || null };
  const gh = body.match(GH_MARKER);
  if (gh) return { author: gh[1], isAnon: false, avatarUrl: gh[2] || null };
  return {
    author: author?.login ?? "ghost",
    isAnon: false,
    avatarUrl: author?.avatarUrl ?? null,
  };
}

// Suppress a hidden author on the public talk feeds: replace the pseudonym and
// drop the avatar (a GitHub avatar would otherwise de-anonymize them). Body HTML
// is content, not a label, so — like /diff — it's left as-is.
function redactAuthor<T extends { author: string; avatarUrl: string | null }>(
  out: T,
  redact: Redactor,
): T {
  const author = redact.author(out.author);
  return author === out.author ? out : { ...out, author, avatarUrl: null };
}

function normalizeComment(c: RawComment, redact: Redactor): OutComment {
  const reply = c.body.match(REPLY_MARKER);
  return redactAuthor(
    {
      id: c.id,
      ...authorOf(c.body, c.author),
      bodyHtml: c.bodyHTML,
      createdAt: c.createdAt,
      url: c.url,
      replyTo: reply ? reply[1] : null,
    },
    redact,
  );
}

export async function listTopics(
  env: Env,
  slug: string,
): Promise<{ topics: OutTopic[] }> {
  if (!SLUG_RE.test(slug)) return { topics: [] };
  const prefix = topicPrefix(slug);
  const q = `repo:${env.REPO_OWNER}/${env.REPO_NAME} in:title "talk:${slug}"`;
  const [data, suppressions] = await Promise.all([
    ghGraphQL<{ search: { nodes: (RawTopic | Record<string, never>)[] } }>(
      env,
      LIST_TOPICS,
      { q },
    ),
    loadSuppressions(env),
  ]);
  const redact = makeRedactor(suppressions);
  const topics = data.search.nodes
    .filter((n): n is RawTopic => "title" in n && n.title.startsWith(prefix))
    .map((n) =>
      redactAuthor(
        {
          id: n.id,
          title: n.title.slice(prefix.length),
          ...authorOf(n.body, n.author),
          createdAt: n.createdAt,
          replyCount: n.comments.totalCount,
          lastAt: n.comments.nodes[0]?.createdAt ?? n.createdAt,
        },
        redact,
      ),
    )
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return { topics };
}

interface OutThread {
  id: string;
  title: string;
  root: OutComment;
  comments: OutComment[];
}

export async function getThread(env: Env, id: string): Promise<OutThread> {
  if (!NODE_ID_RE.test(id)) throw new HttpError(400, "Invalid topic id.");
  const [data, suppressions] = await Promise.all([
    ghGraphQL<{
      node:
        | (RawComment & {
            title: string;
            comments: { nodes: RawComment[] };
          })
        | null;
    }>(env, GET_THREAD, { id }),
    loadSuppressions(env),
  ]);
  const d = data.node;
  if (!d || typeof d.title !== "string") throw new HttpError(404, "Topic not found.");
  const redact = makeRedactor(suppressions);
  const root: OutComment = redactAuthor(
    {
      id: d.id,
      ...authorOf(d.body, d.author),
      bodyHtml: d.bodyHTML,
      createdAt: d.createdAt,
      url: d.url,
      replyTo: null,
    },
    redact,
  );
  return {
    id: d.id,
    title: d.title.replace(/^talk:.*? · /s, ""),
    root,
    comments: d.comments.nodes.map((c) => normalizeComment(c, redact)),
  };
}

export async function createTopic(
  env: Env,
  request: Request,
  body: TopicBody,
): Promise<{ id: string }> {
  const slug = String(body.slug ?? "");
  const title = String(body.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const text = String(body.body ?? "").trim();
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "Invalid slug.");
  if (!title) throw new HttpError(400, "A topic needs a title.");
  if (title.length > MAX_TITLE_LEN) throw new HttpError(400, "Title too long.");
  if (!text) throw new HttpError(400, "Empty message.");
  if (utf8Bytes(text) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Message too large.");

  const writer = await resolve(env, request, { token: body.token });
  const { repoId, categoryId } = await discussionContext(env);
  const created = await ghGraphQL<{ createDiscussion: { discussion: { id: string } } }>(
    env,
    CREATE_DISCUSSION,
    {
      repo: repoId,
      cat: categoryId,
      title: topicPrefix(slug) + title,
      body: `${identityMarker(writer)}\n\n${text}`,
    },
  );
  return { id: created.createDiscussion.discussion.id };
}

export async function postComment(
  env: Env,
  request: Request,
  body: CommentBody,
): Promise<{ ok: true }> {
  const topicId = String(body.topicId ?? "");
  const text = String(body.body ?? "").trim();
  const replyTo = body.replyTo ? String(body.replyTo) : "";
  if (!NODE_ID_RE.test(topicId)) throw new HttpError(400, "Invalid topic.");
  if (replyTo && !NODE_ID_RE.test(replyTo))
    throw new HttpError(400, "Invalid reply target.");
  if (!text) throw new HttpError(400, "Empty comment.");
  if (utf8Bytes(text) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Comment too large.");

  const writer = await resolve(env, request, { token: body.token });

  // Who this reply is for: the parent comment's author, or the topic author for a
  // top-level comment ("check the previous message", no index). Best-effort.
  const { key: recipient, url } = await replyRecipient(
    env,
    topicId,
    replyTo,
    writer.key,
  );
  const mention = recipient ? mentionFor(recipient) : null;

  const marker = `${identityMarker(writer)}${replyTo ? `\n<!-- reply-to:${replyTo} -->` : ""}`;
  // A *visible* `@login` is what triggers GitHub's native notification (the hidden
  // identity marker doesn't); wg: recipients get an email instead (below).
  const lead = mention ? `@${mention} ` : "";
  await ghGraphQL(env, ADD_COMMENT, {
    d: topicId,
    body: `${marker}\n\n${lead}${text}`,
  });

  if (recipient?.startsWith("wg:"))
    await notifyByEmail(env, recipient, {
      subject: "New reply on a discussion you're in",
      body: "Someone replied to you in a discussion on this wiki.",
      link: url,
    });
  return { ok: true };
}

// Top-level comment: the recipient is the topic author (its body), and we need
// the discussion url for the email link.
const TOPIC_QUERY = `query($id:ID!){
  node(id:$id){ ... on Discussion { url body } }
}`;
// Reply: fetch only the parent comment's body (not the whole thread) plus the
// discussion url — two aliased node lookups in one round-trip.
const REPLY_QUERY = `query($topic:ID!,$reply:ID!){
  topic: node(id:$topic){ ... on Discussion { url } }
  reply: node(id:$reply){ ... on DiscussionComment { body } }
}`;

// The identity to notify for a new comment: the replied-to comment's author, or
// the topic author for a top-level comment. Never the replier themselves, and
// never throws — a lookup miss just means no notification. Targets the one node
// it needs, so it doesn't scale with (or get capped by) thread size.
async function replyRecipient(
  env: Env,
  topicId: string,
  replyTo: string,
  selfKey: string,
): Promise<{ key: string | null; url: string }> {
  try {
    let url = "";
    let targetBody: string | undefined;
    if (replyTo) {
      const d = await ghGraphQL<{
        topic: { url: string } | null;
        reply: { body: string } | null;
      }>(env, REPLY_QUERY, { topic: topicId, reply: replyTo });
      url = d.topic?.url ?? "";
      targetBody = d.reply?.body;
    } else {
      const d = await ghGraphQL<{ node: { url: string; body: string } | null }>(
        env,
        TOPIC_QUERY,
        { id: topicId },
      );
      url = d.node?.url ?? "";
      targetBody = d.node?.body;
    }
    const key = targetBody ? participantKeyOf(targetBody) : null;
    return { key: key && key !== selfKey ? key : null, url };
  } catch {
    return { key: null, url: "" };
  }
}
