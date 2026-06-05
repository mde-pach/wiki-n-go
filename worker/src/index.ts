interface Env {
  GITHUB_TOKEN: string;
  HASH_SECRET: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  BRANCH: string;
  CONTENT_DIR: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT?: KVNamespace; // unset until a KV namespace is bound; rate limiting then activates
  TURNSTILE_SECRET?: string; // unset until a Turnstile widget is wired; bot check then activates
  REPO_ID: string;
  DISCUSSION_CATEGORY_ID: string;
}

interface EditBody {
  slug?: unknown;
  content?: unknown;
  summary?: unknown;
  token?: unknown;
}

interface CommentBody {
  slug?: unknown;
  body?: unknown;
  token?: unknown;
}

type GhInit = { method?: string; body?: string; allow404?: boolean };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_CONTENT_BYTES = 100_000;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 600;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    const url = new URL(request.url);
    const q = url.searchParams;
    const routes: Record<string, () => Promise<unknown>> = {
      "GET /latest": () => latestSha(env),
      "GET /pages": () => listPages(env),
      "GET /history": () => history(env, q.get("slug") ?? ""),
      "GET /diff": () =>
        diff(env, q.get("slug") ?? "", q.get("base") ?? "", q.get("head") ?? ""),
      "GET /comments": () => listComments(env, q.get("slug") ?? ""),
      "POST /edit": async () =>
        proposeEdit(env, request, (await request.json()) as EditBody),
      "POST /comment": async () =>
        postComment(env, request, (await request.json()) as CommentBody),
    };

    const handler = routes[`${request.method} ${url.pathname}`];
    if (!handler) return json({ error: "Not found" }, 404, headers);
    try {
      return json(await handler(), 200, headers);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }
  },
};

// Read-through KV cache so many readers share one GitHub call. KV is the
// RATE_LIMIT binding; until it's bound, every call goes straight to `produce`.
async function cached<T>(
  env: Env,
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
): Promise<T> {
  const kv = env.RATE_LIMIT;
  if (kv) {
    const raw = await kv.get(key);
    if (raw) {
      const hit = JSON.parse(raw) as { v: T; ts: number };
      if (Date.now() - hit.ts < ttlMs) return hit.v;
    }
  }
  const v = await produce();
  if (kv) await kv.put(key, JSON.stringify({ v, ts: Date.now() }));
  return v;
}

// Latest commit SHA, briefly cached so many readers share one GitHub call.
async function latestSha(env: Env): Promise<{ sha: string }> {
  const sha = await cached(env, "meta:latest-sha", 20_000, async () => {
    const res = await fetch(
      `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits/${env.BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.sha",
          "User-Agent": `${env.REPO_NAME}-worker`,
        },
      },
    );
    if (!res.ok) throw new HttpError(502, `GitHub ${res.status}`);
    return (await res.text()).trim();
  });
  return { sha };
}

// All page slugs under content/, briefly cached so it's fresh without rebuilds.
async function listPages(env: Env): Promise<{ pages: string[] }> {
  const pages = await cached(env, "meta:pages", 60_000, async () => {
    const tree = await gh<{ tree: { path: string; type: string }[] }>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/git/trees/${env.BRANCH}?recursive=1`,
    );
    const prefix = `${env.CONTENT_DIR}/`;
    return tree.tree
      .filter(
        (n) => n.type === "blob" && n.path.startsWith(prefix) && n.path.endsWith(".md"),
      )
      .map((n) => n.path.slice(prefix.length, -3));
  });
  return { pages };
}

interface CommitItem {
  sha: string;
  parents: { sha: string }[];
  commit: { author: { name: string; date: string }; message: string };
}

async function history(env: Env, slug: string) {
  if (!SLUG_RE.test(slug)) return { revisions: [] };
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const commits = await gh<CommitItem[]>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?path=${path}&sha=${env.BRANCH}&per_page=50`,
  );
  return {
    revisions: commits.map((c) => ({
      sha: c.sha,
      parent: c.parents[0]?.sha ?? null,
      author: c.commit.author.name,
      date: c.commit.author.date,
      message: c.commit.message.split("\n")[0],
    })),
  };
}

async function diff(env: Env, slug: string, base: string, head: string) {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "Invalid slug.");
  if (!/^[0-9a-f]{7,40}$/.test(base) || !/^[0-9a-f]{7,40}$/.test(head)) {
    throw new HttpError(400, "Invalid revision.");
  }
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const cmp = await gh<{ files?: { filename: string; patch?: string }[] }>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/compare/${base}...${head}`,
  );
  return { patch: cmp.files?.find((f) => f.filename === path)?.patch ?? null };
}

// The shared anonymous-write gate: bot check, derive the pseudonym, reject bans,
// enforce the rate limit. Both edits and comments must pass through here.
async function authenticateAnon(
  env: Env,
  request: Request,
  token: unknown,
): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  await verifyTurnstile(env, ip, token ? String(token) : "");
  const author = `anon-${await ipHash(env.HASH_SECRET, ip)}`;
  if (await isBanned(env, author)) throw new HttpError(403, "This source is blocked.");
  await enforceRateLimit(env, author);
  return author;
}

async function proposeEdit(env: Env, request: Request, body: EditBody) {
  const slug = String(body.slug ?? "");
  const content = String(body.content ?? "");
  const summary = body.summary ? String(body.summary) : "";

  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (utf8Bytes(content) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Content too large.");

  const author = await authenticateAnon(env, request, body.token);

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const branch = `${author}/${slug.replace(/\//g, "-")}-${crypto.randomUUID().slice(0, 8)}`;

  const base = await gh<{ object: { sha: string } }>(
    env,
    `/repos/${repo}/git/ref/heads/${env.BRANCH}`,
  );
  await gh(env, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
  });

  await gh(env, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: summary || `Edit ${slug}`,
      content: toBase64(content),
      branch,
      sha: await currentFileSha(env, repo, path),
      author: { name: author, email: `${author}@anon.invalid` },
      committer: { name: `${env.REPO_NAME} bot`, email: "bot@anon.invalid" },
    }),
  });

  const pr = await gh<{ html_url: string }>(env, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: summary || `Anonymous edit: ${slug}`,
      head: branch,
      base: env.BRANCH,
      body: `Proposed in-site by \`${author}\`.`,
    }),
  });

  return { prUrl: pr.html_url, author };
}

async function gh<T = unknown>(env: Env, path: string, init: GhInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method,
    body: init.body,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": `${env.REPO_NAME}-worker`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404 && init.allow404) return undefined as T;
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// Returns the file's blob SHA on the base branch, or undefined if it's new.
async function currentFileSha(
  env: Env,
  repo: string,
  path: string,
): Promise<string | undefined> {
  const file = await gh<{ sha: string } | undefined>(
    env,
    `/repos/${repo}/contents/${path}?ref=${env.BRANCH}`,
    { allow404: true },
  );
  return file?.sha;
}

async function verifyTurnstile(env: Env, ip: string, token: string): Promise<void> {
  if (!env.TURNSTILE_SECRET) return;
  if (!token) throw new HttpError(400, "Missing challenge token.");
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new HttpError(403, "Bot check failed.");
}

// Fixed-window per-source limit. KV is eventually consistent, so this is coarse
// abuse control, not a precise quota — sufficient alongside PR review.
async function enforceRateLimit(env: Env, author: string): Promise<void> {
  if (!env.RATE_LIMIT) return;
  const key = `rl:${author}`;
  const count = Number.parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10);
  if (count >= RATE_LIMIT_MAX)
    throw new HttpError(429, "Too many edits — try again later.");
  await env.RATE_LIMIT.put(key, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_S,
  });
}

// Ban list lives at the repo root, outside the anon-writable content/ dir.
async function isBanned(env: Env, author: string): Promise<boolean> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${env.BRANCH}/bans.json`,
  );
  if (!res.ok) return false;
  try {
    const list = (await res.json()) as unknown;
    return Array.isArray(list) && list.includes(author);
  } catch {
    return false;
  }
}

export async function ipHash(secret: string, ip: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

function toBase64(str: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(str)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function utf8Bytes(str: string): number {
  return new TextEncoder().encode(str).length;
}

interface OutComment {
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  bodyHtml: string;
  createdAt: string;
  url: string;
}

interface RawComment {
  body: string;
  bodyHTML: string;
  createdAt: string;
  url: string;
  author: { login: string; avatarUrl: string } | null;
}

const ANON_MARKER = /<!--\s*anon:([a-z0-9-]+)\s*-->/;

const SEARCH_WITH_COMMENTS = `query($q:String!){
  search(query:$q, type:DISCUSSION, first:10){ nodes{ ... on Discussion {
    title
    comments(first:50){ nodes{ body bodyHTML createdAt url author{ login avatarUrl } } }
  } } }
}`;

const FIND_DISCUSSION = `query($q:String!){
  search(query:$q, type:DISCUSSION, first:10){ nodes{ ... on Discussion { id title } } }
}`;

const CREATE_DISCUSSION = `mutation($repo:ID!,$cat:ID!,$title:String!,$body:String!){
  createDiscussion(input:{repositoryId:$repo,categoryId:$cat,title:$title,body:$body}){ discussion{ id } }
}`;

const ADD_COMMENT = `mutation($d:ID!,$body:String!){
  addDiscussionComment(input:{discussionId:$d,body:$body}){ comment{ id } }
}`;

async function ghGraphQL<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": `${env.REPO_NAME}-worker`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new HttpError(502, `GitHub GraphQL ${res.status}`);
  const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (data.errors?.length) throw new HttpError(502, data.errors[0].message);
  if (!data.data) throw new HttpError(502, "GraphQL returned no data");
  return data.data;
}

function normalizeComment(c: RawComment): OutComment {
  const m = c.body.match(ANON_MARKER);
  return {
    author: m ? m[1] : (c.author?.login ?? "ghost"),
    isAnon: Boolean(m),
    avatarUrl: m ? null : (c.author?.avatarUrl ?? null),
    bodyHtml: c.bodyHTML,
    createdAt: c.createdAt,
    url: c.url,
  };
}

async function listComments(
  env: Env,
  slug: string,
): Promise<{ comments: OutComment[] }> {
  if (!SLUG_RE.test(slug)) return { comments: [] };
  const q = `repo:${env.REPO_OWNER}/${env.REPO_NAME} in:title "${slug}"`;
  const data = await ghGraphQL<{
    search: {
      nodes: (
        | { title: string; comments: { nodes: RawComment[] } }
        | Record<string, never>
      )[];
    };
  }>(env, SEARCH_WITH_COMMENTS, { q });
  const disc = data.search.nodes.find((n) => "title" in n && n.title === slug);
  if (!disc || !("comments" in disc)) return { comments: [] };
  return { comments: disc.comments.nodes.map(normalizeComment) };
}

async function ensureDiscussion(env: Env, slug: string): Promise<string> {
  const q = `repo:${env.REPO_OWNER}/${env.REPO_NAME} in:title "${slug}"`;
  const found = await ghGraphQL<{ search: { nodes: { id: string; title: string }[] } }>(
    env,
    FIND_DISCUSSION,
    { q },
  );
  const existing = found.search.nodes.find((n) => n.title === slug);
  if (existing) return existing.id;
  const created = await ghGraphQL<{ createDiscussion: { discussion: { id: string } } }>(
    env,
    CREATE_DISCUSSION,
    {
      repo: env.REPO_ID,
      cat: env.DISCUSSION_CATEGORY_ID,
      title: slug,
      body: `Talk page for \`${slug}\`.`,
    },
  );
  return created.createDiscussion.discussion.id;
}

async function postComment(
  env: Env,
  request: Request,
  body: CommentBody,
): Promise<{ ok: true }> {
  const slug = String(body.slug ?? "");
  const text = String(body.body ?? "").trim();
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "Invalid slug.");
  if (!text) throw new HttpError(400, "Empty comment.");
  if (utf8Bytes(text) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Comment too large.");

  const author = await authenticateAnon(env, request, body.token);

  const discussionId = await ensureDiscussion(env, slug);
  await ghGraphQL(env, ADD_COMMENT, {
    d: discussionId,
    body: `<!-- anon:${author} -->\n\n${text}`,
  });
  return { ok: true };
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin") ?? "";
  const allow =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(
  data: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
