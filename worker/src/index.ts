import { parse as parseYaml } from "yaml";
import {
  type Citation,
  type CiteQuery,
  classify,
  crossrefCitation,
  formatMarkdown,
  htmlMetaCitation,
  openLibraryCitation,
} from "./citelib";
import { evaluateFilters, type FilterConfig } from "./filters";
import {
  buildNode,
  graphFromMap,
  type IndexMap,
  searchDocsFromMap,
  slugifyTarget,
} from "./indexlib";

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
  // Discussion target. Both IDs are derived at runtime from REPO_OWNER/REPO_NAME
  // + DISCUSSION_CATEGORY (so a fork needs no manual lookup); set them only to
  // override the derivation.
  REPO_ID?: string;
  DISCUSSION_CATEGORY_ID?: string;
  DISCUSSION_CATEGORY?: string; // category name to post talk topics in (default "General")
  // Autonomous-editing knobs (all optional; defaults keep the reviewed-PR model).
  DEFAULT_EDIT_TIER?: string; // tier required to edit a path with no protection.json rule (default "maintainer")
  AUTOCONFIRM_EDITS?: string; // accepted edits for the "auto" tier (default 10)
  AUTOCONFIRM_DAYS?: string; // age in days for the "auto" tier (default 4)
  EXTENDED_EDITS?: string; // accepted edits for the "extended" tier (default 500)
  EXTENDED_DAYS?: string; // age in days for the "extended" tier (default 30)
  HOME_SLUG?: string; // slug treated as the home page (excluded from orphans; default "index")
  // Optional GitHub sign-in. Unset → sign-in is disabled and every path stays
  // anonymous. CLIENT_ID is public; CLIENT_SECRET + SESSION_SECRET are secrets.
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

interface EditBody {
  slug?: unknown;
  content?: unknown;
  summary?: unknown;
  token?: unknown;
}

interface MoveBody {
  from?: unknown;
  to?: unknown;
  summary?: unknown;
  token?: unknown;
}

interface TopicBody {
  slug?: unknown;
  title?: unknown;
  body?: unknown;
  token?: unknown;
}

interface CommentBody {
  topicId?: unknown;
  replyTo?: unknown;
  body?: unknown;
  token?: unknown;
}

interface PatrolBody {
  sha?: unknown;
}

interface ReviewBody {
  number?: unknown;
  action?: unknown; // "merge" | "close"
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
const NODE_ID_RE = /^[A-Za-z0-9_=-]+$/;
const MAX_TITLE_LEN = 120;
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
      "GET /link-graph": () => linkGraph(env),
      "GET /search-index": () => searchIndex(env),
      "GET /cite": () => cite(env, q.get("q") ?? ""),
      "GET /history": () => history(env, q.get("slug") ?? ""),
      "GET /diff": () =>
        diff(env, q.get("slug") ?? "", q.get("base") ?? "", q.get("head") ?? ""),
      "GET /topics": () => listTopics(env, q.get("slug") ?? ""),
      "GET /topic": () => getThread(env, q.get("id") ?? ""),
      "GET /whoami": () => whoami(env, request),
      "GET /changes": () => listChanges(env, q.get("limit") ?? ""),
      "GET /pending": () => listPending(env),
      "GET /pending-diff": () => pendingDiff(env, q.get("number") ?? ""),
      "GET /auth/status": () => Promise.resolve({ enabled: oauthConfigured(env) }),
      "GET /auth/login": () => authLogin(env, url),
      "GET /auth/callback": () => authCallback(env, url),
      "POST /edit": async () =>
        proposeEdit(env, request, (await request.json()) as EditBody),
      "POST /move": async () =>
        movePage(env, request, (await request.json()) as MoveBody),
      "POST /patrol": async () =>
        patrol(env, request, (await request.json()) as PatrolBody),
      "POST /review": async () =>
        review(env, request, (await request.json()) as ReviewBody),
      "POST /topic": async () =>
        createTopic(env, request, (await request.json()) as TopicBody),
      "POST /comment": async () =>
        postComment(env, request, (await request.json()) as CommentBody),
    };

    const handler = routes[`${request.method} ${url.pathname}`];
    if (!handler) return json({ error: "Not found" }, 404, headers);
    try {
      const out = await handler();
      // Auth routes return a redirect Response directly; everything else is JSON.
      if (out instanceof Response) return out;
      return json(out, 200, headers);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }
  },
};

async function kvGetJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.RATE_LIMIT?.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function kvPutJson(
  env: Env,
  key: string,
  value: unknown,
  opts?: KVNamespacePutOptions,
): Promise<void> {
  await env.RATE_LIMIT?.put(key, JSON.stringify(value), opts);
}

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

async function latestSha(env: Env): Promise<{ sha: string }> {
  const sha = await cached(env, "meta:latest-sha", 20_000, async () => {
    const res = await fetch(
      `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits/${env.BRANCH}`,
      { headers: { ...ghAuth(env), Accept: "application/vnd.github.sha" } },
    );
    if (!res.ok) throw new HttpError(502, `GitHub ${res.status}`);
    return (await res.text()).trim();
  });
  return { sha };
}

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

const INDEX_TTL_MS = 3_600_000; // safety rebuild for drift (PR merges, direct pushes)

// Live link/search index: a per-slug map maintained incrementally on direct
// edits and rebuilt in full only on a cache miss (first call, after a merge, or
// once the TTL lapses). Reports derive from it in memory — no per-request fetch.
async function getIndex(env: Env): Promise<IndexMap> {
  return cached(env, "meta:index", INDEX_TTL_MS, () => buildIndex(env));
}

async function buildIndex(env: Env): Promise<IndexMap> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const { pages } = await listPages(env);
  const map: IndexMap = {};
  await Promise.all(
    pages.map(async (slug) => {
      const file = await getCurrentFile(env, repo, `${env.CONTENT_DIR}/${slug}.md`);
      if (file) map[slug] = nodeFromRaw(slug, file.raw);
    }),
  );
  return map;
}

function nodeFromRaw(slug: string, raw: string) {
  const meta = frontmatter(raw);
  const redirect =
    typeof meta.redirect === "string" ? slugifyTarget(meta.redirect) : undefined;
  return buildNode(slug, raw, redirect);
}

// Patch one page's entry after a direct commit — no refetch, the content is in
// hand. If the index isn't built yet, skip; the next read builds it fresh.
async function updateIndexEntry(env: Env, slug: string, raw: string): Promise<void> {
  const hit = await kvGetJson<{ v: IndexMap }>(env, "meta:index");
  if (!hit) return;
  hit.v[slug] = nodeFromRaw(slug, raw);
  await kvPutJson(env, "meta:index", { v: hit.v, ts: Date.now() });
}

// Drop the cached content pointers so the next read reflects a write. The direct-edit
// path keeps `meta:index` (it patches that entry in place via updateIndexEntry).
async function invalidateContent(
  env: Env,
  author?: string,
  opts: { keepIndex?: boolean } = {},
): Promise<void> {
  const kv = env.RATE_LIMIT;
  if (!kv) return;
  await kv.delete("meta:latest-sha");
  await kv.delete("meta:pages");
  if (!opts.keepIndex) await kv.delete("meta:index");
  if (author) await kv.delete(`trust:${author}`);
}

function linkGraph(env: Env) {
  return getIndex(env).then((map) => graphFromMap(map, env.HOME_SLUG ?? "index"));
}

function searchIndex(env: Env) {
  return getIndex(env).then((map) => ({ docs: searchDocsFromMap(map) }));
}

const CITE_TTL_MS = 86_400_000;

function cite(env: Env, input: string) {
  const query = classify(input);
  if (!query) throw new HttpError(400, "Enter a URL, DOI, or ISBN.");
  return cached(env, `cite:${query.kind}:${query.value}`, CITE_TTL_MS, async () => {
    const citation = await lookupCitation(env, query);
    return { citation, markdown: formatMarkdown(citation) };
  });
}

async function lookupCitation(env: Env, query: CiteQuery): Promise<Citation> {
  const ua = `${env.REPO_NAME}-worker (citation lookup)`;
  if (query.kind === "doi") {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(query.value)}`,
      { headers: { "User-Agent": ua, Accept: "application/json" } },
    );
    if (!res.ok) throw new HttpError(404, "Couldn't resolve that DOI.");
    const json = (await res.json()) as {
      message?: Parameters<typeof crossrefCitation>[0];
    };
    return crossrefCitation(json.message ?? {}, query.value);
  }
  if (query.kind === "isbn") {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${query.value}&format=json&jscmd=data`,
      { headers: { "User-Agent": ua } },
    );
    const json = (await res.json()) as Record<
      string,
      Parameters<typeof openLibraryCitation>[0]
    >;
    const book = json[`ISBN:${query.value}`];
    if (!book) throw new HttpError(404, "Couldn't find that ISBN.");
    return openLibraryCitation(book, query.value);
  }
  assertFetchableUrl(query.value);
  const res = await fetch(query.value, {
    headers: { "User-Agent": ua },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(422, "Couldn't fetch that URL.");
  const html = (await res.text()).slice(0, 262_144);
  return htmlMetaCitation(html, res.url || query.value);
}

// Block the obvious SSRF targets; the Worker fetches arbitrary user-supplied URLs.
function assertFetchableUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new HttpError(400, "Only http(s) URLs are supported.");
  const host = url.hostname.toLowerCase();
  const blocked =
    /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|\[::1\])/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local");
  if (blocked) throw new HttpError(400, "Refusing to fetch a private address.");
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

interface ChangeDetail {
  slugs: string[];
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
}

const SHA_RE = /^[0-9a-f]{7,40}$/;

// Per-commit files + byte stats. A commit is immutable, so cache it forever.
async function changeDetail(env: Env, sha: string): Promise<ChangeDetail> {
  const key = `change:${sha}`;
  const cached = await kvGetJson<ChangeDetail>(env, key);
  if (cached) return cached;
  const d = await gh<{
    stats?: { additions: number; deletions: number };
    files?: { filename: string }[];
  }>(env, `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits/${sha}`);
  const prefix = `${env.CONTENT_DIR}/`;
  const detail: ChangeDetail = {
    slugs: (d.files ?? [])
      .filter((f) => f.filename.startsWith(prefix) && f.filename.endsWith(".md"))
      .map((f) => f.filename.slice(prefix.length, -3)),
    additions: d.stats?.additions ?? 0,
    deletions: d.stats?.deletions ?? 0,
  };
  await kvPutJson(env, key, detail);
  return detail;
}

async function listChanges(
  env: Env,
  limitStr: string,
): Promise<{ changes: OutChange[] }> {
  const limit = Math.min(Math.max(Number.parseInt(limitStr, 10) || 30, 1), 100);
  const commits = await gh<CommitItem[]>(
    env,
    `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits?path=${env.CONTENT_DIR}&sha=${env.BRANCH}&per_page=${limit}`,
  );
  const changes = await Promise.all(
    commits.map(async (c) => {
      const [detail, patrolled, tags] = await Promise.all([
        changeDetail(env, c.sha),
        env.RATE_LIMIT?.get(`patrol:${c.sha}`).then(Boolean) ?? Promise.resolve(false),
        env.RATE_LIMIT?.get(`tag:${c.sha}`).then((t) =>
          t ? (JSON.parse(t) as string[]) : [],
        ) ?? Promise.resolve([] as string[]),
      ]);
      return {
        sha: c.sha,
        author: c.commit.author.name,
        isAnon: c.commit.author.name.startsWith("anon-"),
        date: c.commit.author.date,
        message: c.commit.message.split("\n")[0],
        patrolled,
        tags,
        ...detail,
      };
    }),
  );
  return { changes };
}

// Mark a commit reviewed. Maintainer-only, by trust tier — no token needed
// (it only flips a flag).
async function patrol(
  env: Env,
  request: Request,
  body: PatrolBody,
): Promise<{ ok: true }> {
  const sha = String(body.sha ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  await requireMaintainer(env, request, "Patrolling");
  await env.RATE_LIMIT?.put(`patrol:${sha}`, "1");
  return { ok: true };
}

// Shared maintainer gate for the in-UI moderation actions. Works for an
// anonymous maintainer (by ip_hash) or a signed-in one (by GitHub login).
async function requireMaintainer(
  env: Env,
  request: Request,
  action: string,
): Promise<void> {
  const { name, email } = await resolve(env, request);
  if ((await editorTier(env, name, email)) !== "maintainer")
    throw new HttpError(403, `${action} requires maintainer access.`);
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
function isInSiteRef(ref: string): boolean {
  return ref.startsWith("anon-") || ref.startsWith("gh-");
}

function refIdentity(ref: string): { author: string; isAnon: boolean } {
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

async function listPending(env: Env): Promise<{ pending: OutPending[] }> {
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

async function pendingDiff(
  env: Env,
  numberStr: string,
): Promise<{ patch: string | null }> {
  const number = Number.parseInt(numberStr, 10);
  if (!Number.isInteger(number) || number <= 0)
    throw new HttpError(400, "Invalid pull request.");
  const files = await prContentFiles(env, number);
  return { patch: files[0]?.patch ?? null };
}

// Merge (squash → live) or close a pending edit. Maintainer-only.
async function review(
  env: Env,
  request: Request,
  body: ReviewBody,
): Promise<{ ok: true }> {
  const number = Number(body.number);
  const action = String(body.action ?? "");
  if (!Number.isInteger(number) || number <= 0)
    throw new HttpError(400, "Invalid pull request.");
  if (action !== "merge" && action !== "close")
    throw new HttpError(400, "Invalid action.");

  await requireMaintainer(env, request, "Reviewing");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const pr = await gh<{ head: { ref: string }; title: string }>(
    env,
    `/repos/${repo}/pulls/${number}`,
  );
  if (!isInSiteRef(pr.head.ref)) throw new HttpError(400, "Not an in-site edit.");

  if (action === "merge") {
    await gh(env, `/repos/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", commit_title: pr.title }),
    });
    await invalidateContent(env, refIdentity(pr.head.ref).author);
  } else {
    await gh(env, `/repos/${repo}/pulls/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
  }
  await gh(env, `/repos/${repo}/git/refs/heads/${pr.head.ref}`, {
    method: "DELETE",
    allow404: true,
  });
  return { ok: true };
}

async function diff(env: Env, slug: string, base: string, head: string) {
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

// Resolved identity behind a write: anonymous pseudonym or verified GitHub user.
// `name` is the display label + trusted-editors / commit-author name; `email`
// fills the commit author and keys trust-by-history; `key` namespaces bans and
// rate-limit counters.
interface Writer {
  name: string;
  email: string;
  avatar: string | null;
  isAnon: boolean;
  key: string;
}

function anonWriter(hash: string): Writer {
  const name = `anon-${hash}`;
  return { name, email: `${name}@anon.invalid`, avatar: null, isAnon: true, key: name };
}

function githubWriter(s: Session): Writer {
  return {
    name: s.login,
    email: ghNoreplyEmail(s.id, s.login),
    avatar: s.avatar ?? null,
    isAnon: false,
    key: `gh:${s.login}`,
  };
}

// The request's identity: a verified GitHub session, else the anonymous
// pseudonym. With `gate`, this is a write: a GitHub session skips the bot check
// (OAuth already proved a human) while the anonymous path keeps Turnstile, and
// both reject bans and enforce the per-identity rate limit. Without it, it's a
// read-only actor lookup (whoami, patrol, review) — no gate.
async function resolve(
  env: Env,
  request: Request,
  gate?: { token: unknown },
): Promise<Writer> {
  const session = await sessionIdentity(env, request);
  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const writer = session
    ? githubWriter(session)
    : anonWriter(await ipHash(env.HASH_SECRET, ip));
  if (!gate) return writer;
  if (!session) await verifyTurnstile(env, ip, gate.token ? String(gate.token) : "");
  if (await isBanned(env, writer.key))
    throw new HttpError(
      403,
      writer.isAnon ? "This source is blocked." : "This account is blocked.",
    );
  await enforceRateLimit(env, writer.key);
  return writer;
}

// Tiers form one ordered scale shared by editors and pages: an editor of rank
// ≥ a page's required rank may publish directly.
type Tier = "open" | "auto" | "extended" | "maintainer";
const TIER_RANK: Record<Tier, number> = {
  open: 0,
  auto: 1,
  extended: 2,
  maintainer: 3,
};
const asTier = (s: string | undefined, fallback: Tier): Tier =>
  s && s in TIER_RANK ? (s as Tier) : fallback;

// An editor's accepted-edit record, derived from git history (cached). Both
// direct commits and merged PRs land on the branch as commits authored by the
// pseudonym, so counting them is the single source of truth — no ledger to keep.
interface TrustStats {
  n: number; // accepted edits authored by this pseudonym on the live branch
  firstMs: number; // epoch ms of their earliest such commit
}

export function frontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    const data = parseYaml(m[1]);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// A page's required edit tier = its `protection` field (env default when unset).
export function pageTier(env: Env, meta: Record<string, unknown>): Tier {
  return asTier(
    typeof meta.protection === "string" ? meta.protection : undefined,
    asTier(env.DEFAULT_EDIT_TIER, "maintainer"),
  );
}

// Gate writes to privileged properties. Protection needs tier ≥ the bar for
// both its old and new value (can't raise it above, nor lower it from above,
// your own level); other privileged fields need their flat minimum.
function enforceFieldPermissions(
  env: Env,
  tier: Tier,
  oldMeta: Record<string, unknown>,
  newMeta: Record<string, unknown>,
): void {
  const oldP = pageTier(env, oldMeta);
  const newP = pageTier(env, newMeta);
  if (TIER_RANK[oldP] !== TIER_RANK[newP]) {
    if (TIER_RANK[tier] < Math.max(TIER_RANK[oldP], TIER_RANK[newP]))
      throw new HttpError(403, "You can't change this page's protection level.");
  }
}

// Maintainer allowlist lives at the repo root, same store as bans.json.
async function trustedEditors(env: Env): Promise<string[]> {
  const list = await repoJson<unknown>(env, "trusted-editors.json");
  return Array.isArray(list) ? (list as string[]) : [];
}

// A JSON config file from the repo root (same store as bans/trusted-editors).
async function repoJson<T>(env: Env, file: string): Promise<T | null> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${env.BRANCH}/${file}`,
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Pre-publish abuse filter. Trusted tiers are exempt (abuse concentrates in
// open-tier edits); everyone else's edit is scored against filters.json.
async function runFilters(env: Env, tier: Tier, oldRaw: string, newContent: string) {
  const cfg = await repoJson<FilterConfig>(env, "filters.json");
  if (!cfg) return { action: "allow" as const, tags: [] as string[] };
  if (
    cfg.exemptTier &&
    TIER_RANK[tier] >= TIER_RANK[asTier(cfg.exemptTier, "maintainer")]
  )
    return { action: "allow" as const, tags: [] as string[] };
  return evaluateFilters(cfg, { oldRaw, newContent });
}

// The caller's pseudonym + trust tier, so the editor can show identity and
// gate privileged controls (e.g. the protection picker). No write, no token.
async function whoami(
  env: Env,
  request: Request,
): Promise<{ author: string; tier: Tier; avatar: string | null; isAnon: boolean }> {
  const { name, email, avatar, isAnon } = await resolve(env, request);
  return { author: name, tier: await editorTier(env, name, email), avatar, isAnon };
}

const TRUST_TTL_S = 3600;

// Trust tier from accepted-edit history. `name` matches the maintainer
// allowlist + caches the result; `email` is the commit-author filter. Anonymous
// and signed-in identities share the exact same machinery and thresholds.
async function editorTier(env: Env, name: string, email: string): Promise<Tier> {
  // The repo owner is always a maintainer. A signed-in login is identity-verified
  // by OAuth, so login === REPO_OWNER is provably the owner — no allowlist entry
  // needed. (Anonymous names are `anon-<hash>`, so they can't match.)
  if (name === env.REPO_OWNER) return "maintainer";
  if ((await trustedEditors(env)).includes(name)) return "maintainer";
  const { n, firstMs } = await trustStats(env, name, email);
  const days = (Date.now() - firstMs) / 86_400_000;
  const num = (v: string | undefined, d: number) => Number.parseInt(v ?? "", 10) || d;
  if (n >= num(env.EXTENDED_EDITS, 500) && days >= num(env.EXTENDED_DAYS, 30))
    return "extended";
  if (n >= num(env.AUTOCONFIRM_EDITS, 10) && days >= num(env.AUTOCONFIRM_DAYS, 4))
    return "auto";
  return "open";
}

// Read the identity's accepted-edit stats, cached briefly in KV to spare the
// GitHub API on every edit.
async function trustStats(env: Env, name: string, email: string): Promise<TrustStats> {
  const key = `trust:${name}`;
  const s = await kvGetJson<Partial<TrustStats>>(env, key);
  if (s && typeof s.n === "number" && typeof s.firstMs === "number")
    return s as TrustStats;
  const stats = await countAuthored(env, email);
  await kvPutJson(env, key, stats, { expirationTtl: TRUST_TTL_S });
  return stats;
}

// `?author=<email>` filters commits by the identity's authoring email; with
// per_page=1 the Link header's `rel="last"` page number is the total count, and
// that last page holds the earliest commit (first-seen).
export function lastPage(link: string): number {
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : 1;
}

async function countAuthored(env: Env, email: string): Promise<TrustStats> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const base = `https://api.github.com/repos/${repo}/commits?author=${encodeURIComponent(
    email,
  )}&sha=${env.BRANCH}&per_page=1`;
  const res = await fetch(base, { headers: ghHeaders(env) });
  if (!res.ok) return { n: 0, firstMs: Date.now() };
  const page = (await res.json()) as CommitItem[];
  if (page.length === 0) return { n: 0, firstMs: Date.now() };
  const n = lastPage(res.headers.get("Link") ?? "");
  let firstMs = new Date(page[0].commit.author.date).getTime();
  if (n > 1) {
    const oldest = await fetch(`${base}&page=${n}`, { headers: ghHeaders(env) });
    if (oldest.ok) {
      const last = (await oldest.json()) as CommitItem[];
      if (last[0]) firstMs = new Date(last[0].commit.author.date).getTime();
    }
  }
  return { n, firstMs };
}

// Current file on the live branch: blob sha (for the next commit) + raw text
// (for protection / field checks). Null when the page is new.
const BOT_COMMITTER_EMAIL = "bot@anon.invalid";
const botCommitter = (env: Env) => ({
  name: `${env.REPO_NAME} bot`,
  email: BOT_COMMITTER_EMAIL,
});

interface CommitArgs {
  message: string;
  content: string;
  branch: string;
  author: { name: string; email: string };
  sha?: string;
}

function commitPayload(env: Env, args: CommitArgs): string {
  return JSON.stringify({
    message: args.message,
    content: toBase64(args.content),
    branch: args.branch,
    sha: args.sha,
    author: args.author,
    committer: botCommitter(env),
  });
}

async function getCurrentFile(
  env: Env,
  repo: string,
  path: string,
): Promise<{ sha: string; raw: string } | null> {
  const file = await gh<{ sha: string; content: string } | undefined>(
    env,
    `/repos/${repo}/contents/${path}?ref=${env.BRANCH}`,
    { allow404: true },
  );
  if (!file) return null;
  const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) =>
    c.charCodeAt(0),
  );
  return { sha: file.sha, raw: new TextDecoder().decode(bytes) };
}

interface EditContext {
  repo: string;
  path: string;
  slug: string;
  content: string;
  summary: string;
  writer: Writer;
  current: { sha: string; raw: string } | null;
  verdict: Awaited<ReturnType<typeof runFilters>>;
}

async function proposeEdit(env: Env, request: Request, body: EditBody) {
  const slug = String(body.slug ?? "");
  const content = String(body.content ?? "");
  const summary = body.summary ? String(body.summary) : "";

  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (utf8Bytes(content) > MAX_CONTENT_BYTES)
    throw new HttpError(413, "Content too large.");

  const writer = await resolve(env, request, { token: body.token });
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;

  const [tier, current] = await Promise.all([
    editorTier(env, writer.name, writer.email),
    getCurrentFile(env, repo, path),
  ]);
  const oldMeta = current ? frontmatter(current.raw) : {};
  enforceFieldPermissions(env, tier, oldMeta, frontmatter(content));
  const required = pageTier(env, oldMeta);

  const verdict = await runFilters(env, tier, current?.raw ?? "", content);
  if (verdict.action === "disallow")
    throw new HttpError(422, verdict.message ?? "This edit was blocked by a filter.");

  const ctx: EditContext = { repo, path, slug, content, summary, writer, current, verdict };
  return TIER_RANK[tier] >= TIER_RANK[required]
    ? publishDirect(env, ctx)
    : openEditPr(env, ctx);
}

function editCommit(env: Env, ctx: EditContext, branch: string): string {
  return commitPayload(env, {
    message: ctx.summary || `Edit ${ctx.slug}`,
    content: ctx.content,
    branch,
    sha: ctx.current?.sha,
    author: { name: ctx.writer.name, email: ctx.writer.email },
  });
}

async function publishDirect(env: Env, ctx: EditContext) {
  const { repo, path, slug, content, writer, verdict } = ctx;
  const res = await gh<{ commit: { sha: string; html_url: string } }>(
    env,
    `/repos/${repo}/contents/${path}`,
    { method: "PUT", body: editCommit(env, ctx, env.BRANCH) },
  );
  await invalidateContent(env, writer.name, { keepIndex: true });
  await updateIndexEntry(env, slug, content);
  if (verdict.tags.length)
    await env.RATE_LIMIT?.put(`tag:${res.commit.sha}`, JSON.stringify(verdict.tags));
  return { live: true, sha: res.commit.sha, url: res.commit.html_url, author: writer.name };
}

// The branch prefix carries the author so the in-UI review queue can attribute
// it (see refIdentity).
async function openEditPr(env: Env, ctx: EditContext) {
  const { repo, path, slug, summary, writer, verdict } = ctx;
  const author = writer.name;
  const prefix = writer.isAnon ? writer.name : `gh-${writer.name}`;
  const branch = `${prefix}/${slug.replace(/\//g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
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
    body: editCommit(env, ctx, branch),
  });
  const pr = await gh<{ html_url: string }>(env, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title:
        summary || `${writer.isAnon ? "Anonymous edit" : `Edit by ${author}`}: ${slug}`,
      head: branch,
      base: env.BRANCH,
      body:
        `Proposed in-site by \`${author}\`.` +
        (verdict.tags.length ? `\n\nFilter tags: ${verdict.tags.join(", ")}` : ""),
    }),
  });
  return { live: false, prUrl: pr.html_url, author };
}

// Move/rename a page: copy it to the new slug and leave a redirect stub behind,
// so inbound links keep working (Wikipedia's move-leaves-a-redirect). Gated to
// whoever may edit the source page; commits directly (no PR fallback).
async function movePage(env: Env, request: Request, body: MoveBody) {
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const summary = body.summary ? String(body.summary) : "";
  if (!SLUG_RE.test(from) || from.includes(".."))
    throw new HttpError(400, "Invalid source slug.");
  if (!SLUG_RE.test(to) || to.includes(".."))
    throw new HttpError(400, "Invalid target slug.");
  if (from === to) throw new HttpError(400, "Source and target are the same.");

  const writer = await resolve(env, request, { token: body.token });
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

function ghAuth(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": `${env.REPO_NAME}-worker`,
  };
}

function ghHeaders(env: Env): Record<string, string> {
  return {
    ...ghAuth(env),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gh<T = unknown>(env: Env, path: string, init: GhInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method,
    body: init.body,
    headers: ghHeaders(env),
  });
  if (res.status === 404 && init.allow404) return undefined as T;
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T; // e.g. DELETE a ref → no body
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
  const list = await repoJson<unknown>(env, "bans.json");
  return Array.isArray(list) && list.includes(author);
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
}

export async function ipHash(secret: string, ip: string): Promise<string> {
  const sig = await hmacSign(secret, ip);
  return [...sig]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Constant-time string compare so signature checks don't leak via timing.
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// No DB, no stored user token: a session is a compact HS256 JWT carrying only
// the verified GitHub identity. We never request email scope — the commit
// author uses GitHub's public no-reply email, so no raw PII is stored.
export interface Session {
  login: string;
  id: number;
  avatar: string;
  exp: number;
}

const SESSION_TTL_MS = 7 * 86_400_000;

export const ghNoreplyEmail = (id: number, login: string): string =>
  `${id}+${login}@users.noreply.github.com`;

export async function signSession(
  secret: string,
  who: { login: string; id: number; avatar: string },
  nowMs: number = Date.now(),
): Promise<string> {
  const header = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const claims = b64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ ...who, exp: Math.floor((nowMs + SESSION_TTL_MS) / 1000) }),
    ),
  );
  const signing = `${header}.${claims}`;
  return `${signing}.${b64urlEncode(await hmacSign(secret, signing))}`;
}

export async function verifySession(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, claims, sig] = parts;
  const expected = b64urlEncode(await hmacSign(secret, `${header}.${claims}`));
  if (!timingSafeEq(sig, expected)) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(claims))) as Session;
    if (typeof body.login !== "string" || typeof body.id !== "number") return null;
    if (typeof body.exp !== "number" || body.exp * 1000 < nowMs) return null;
    return body;
  } catch {
    return null;
  }
}

// CSRF state for the OAuth round-trip: the signed, short-lived return URL — no
// KV write needed, the signature is the anti-forgery proof.
async function signState(secret: string, ret: string): Promise<string> {
  const body = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ r: ret, t: Date.now() })),
  );
  return `${body}.${b64urlEncode(await hmacSign(secret, body))}`;
}

async function verifyState(secret: string, state: string): Promise<string | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEq(sig, b64urlEncode(await hmacSign(secret, body)))) return null;
  try {
    const { r, t } = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof t !== "number" || Date.now() - t > 600_000) return null;
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}

function oauthConfigured(env: Env): boolean {
  return Boolean(env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET && env.SESSION_SECRET);
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Guard the post-sign-in redirect against open-redirect: the return URL must
// live on a configured site origin.
function isAllowedReturn(env: Env, ret: string): boolean {
  let u: URL;
  try {
    u = new URL(ret);
  } catch {
    return false;
  }
  const allowed = allowedOrigins(env);
  return allowed.length === 0 || allowed.includes(u.origin);
}

async function authLogin(env: Env, url: URL): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "Sign-in is not configured.");
  const ret = url.searchParams.get("return") ?? allowedOrigins(env)[0] ?? url.origin;
  if (!isAllowedReturn(env, ret)) throw new HttpError(400, "Invalid return URL.");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.OAUTH_CLIENT_ID as string);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set(
    "state",
    await signState(env.SESSION_SECRET as string, ret),
  );
  return Response.redirect(authorize.toString(), 302);
}

async function authCallback(env: Env, url: URL): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "Sign-in is not configured.");
  const ret = await verifyState(
    env.SESSION_SECRET as string,
    url.searchParams.get("state") ?? "",
  );
  if (!ret || !isAllowedReturn(env, ret))
    throw new HttpError(400, "Invalid sign-in state.");
  const code = url.searchParams.get("code");
  if (!code) throw new HttpError(400, "Missing authorization code.");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new HttpError(502, "Sign-in exchange failed.");

  // Use the token once to read the verified identity, then discard it.
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": `${env.REPO_NAME}-worker`,
    },
  });
  if (!userRes.ok) throw new HttpError(502, "Could not read your GitHub profile.");
  const u = (await userRes.json()) as { login: string; id: number; avatar_url: string };

  const jwt = await signSession(env.SESSION_SECRET as string, {
    login: u.login,
    id: u.id,
    avatar: u.avatar_url,
  });
  const dest = new URL(ret);
  dest.hash = `wikitoken=${jwt}`;
  return Response.redirect(dest.toString(), 302);
}

async function sessionIdentity(env: Env, request: Request): Promise<Session | null> {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/);
  return m ? verifySession(env.SESSION_SECRET, m[1]) : null;
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
const REPLY_MARKER = /<!--\s*reply-to:([A-Za-z0-9_=-]+)\s*-->/;

// The identity marker embedded in a Discussion body for in-site posts.
function identityMarker(writer: Writer): string {
  return writer.isAnon
    ? `<!-- anon:${writer.name} -->`
    : `<!-- gh:${writer.name}|${writer.avatar ?? ""} -->`;
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

async function ghGraphQL<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...ghAuth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new HttpError(502, `GitHub GraphQL ${res.status}`);
  const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (data.errors?.length) throw new HttpError(502, data.errors[0].message);
  if (!data.data) throw new HttpError(502, "GraphQL returned no data");
  return data.data;
}

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
  const gh = body.match(GH_MARKER);
  if (gh) return { author: gh[1], isAnon: false, avatarUrl: gh[2] || null };
  return {
    author: author?.login ?? "ghost",
    isAnon: false,
    avatarUrl: author?.avatarUrl ?? null,
  };
}

function normalizeComment(c: RawComment): OutComment {
  const reply = c.body.match(REPLY_MARKER);
  return {
    id: c.id,
    ...authorOf(c.body, c.author),
    bodyHtml: c.bodyHTML,
    createdAt: c.createdAt,
    url: c.url,
    replyTo: reply ? reply[1] : null,
  };
}

async function listTopics(env: Env, slug: string): Promise<{ topics: OutTopic[] }> {
  if (!SLUG_RE.test(slug)) return { topics: [] };
  const prefix = topicPrefix(slug);
  const q = `repo:${env.REPO_OWNER}/${env.REPO_NAME} in:title "talk:${slug}"`;
  const data = await ghGraphQL<{
    search: { nodes: (RawTopic | Record<string, never>)[] };
  }>(env, LIST_TOPICS, { q });
  const topics = data.search.nodes
    .filter((n): n is RawTopic => "title" in n && n.title.startsWith(prefix))
    .map((n) => ({
      id: n.id,
      title: n.title.slice(prefix.length),
      ...authorOf(n.body, n.author),
      createdAt: n.createdAt,
      replyCount: n.comments.totalCount,
      lastAt: n.comments.nodes[0]?.createdAt ?? n.createdAt,
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return { topics };
}

interface OutThread {
  id: string;
  title: string;
  root: OutComment;
  comments: OutComment[];
}

async function getThread(env: Env, id: string): Promise<OutThread> {
  if (!NODE_ID_RE.test(id)) throw new HttpError(400, "Invalid topic id.");
  const data = await ghGraphQL<{
    node:
      | (RawComment & {
          title: string;
          comments: { nodes: RawComment[] };
        })
      | null;
  }>(env, GET_THREAD, { id });
  const d = data.node;
  if (!d || typeof d.title !== "string") throw new HttpError(404, "Topic not found.");
  const root: OutComment = {
    id: d.id,
    ...authorOf(d.body, d.author),
    bodyHtml: d.bodyHTML,
    createdAt: d.createdAt,
    url: d.url,
    replyTo: null,
  };
  return {
    id: d.id,
    title: d.title.replace(/^talk:.*? · /s, ""),
    root,
    comments: d.comments.nodes.map(normalizeComment),
  };
}

async function createTopic(
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

async function postComment(
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
  const marker = `${identityMarker(writer)}${replyTo ? `\n<!-- reply-to:${replyTo} -->` : ""}`;
  await ghGraphQL(env, ADD_COMMENT, { d: topicId, body: `${marker}\n\n${text}` });
  return { ok: true };
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = allowedOrigins(env);
  const origin = request.headers.get("Origin") ?? "";
  const allow =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
