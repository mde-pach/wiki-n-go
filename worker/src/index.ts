interface Env {
  GITHUB_TOKEN: string;
  HASH_SECRET: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  BRANCH: string;
  CONTENT_DIR: string;
  ALLOWED_ORIGIN: string;
}

interface EditBody {
  slug?: unknown;
  content?: unknown;
  summary?: unknown;
}

type GhInit = { method?: string; body?: string };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_CONTENT_BYTES = 100_000;
const SLUG_RE = /^[a-z0-9][a-z0-9/-]*$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/edit") {
      return json({ error: "Not found" }, 404, headers);
    }

    try {
      const body = (await request.json()) as EditBody;
      return json(await proposeEdit(env, request, body), 200, headers);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }
  },
};

async function proposeEdit(env: Env, request: Request, body: EditBody) {
  const slug = String(body.slug ?? "");
  const content = String(body.content ?? "");
  const summary = body.summary ? String(body.summary) : "";

  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (utf8Bytes(content) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Content too large.");

  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const author = `anon-${await ipHash(env.HASH_SECRET, ip)}`;

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
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// Returns the file's blob SHA on the base branch, or undefined if it's new.
async function currentFileSha(
  env: Env,
  repo: string,
  path: string,
): Promise<string | undefined> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${env.BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": `${env.REPO_NAME}-worker`,
      },
    },
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}`);
  return ((await res.json()) as { sha: string }).sha;
}

async function ipHash(secret: string, ip: string): Promise<string> {
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

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
