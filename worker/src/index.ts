import { parse as parseYaml } from "yaml";
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
  REPO_ID: string;
  DISCUSSION_CATEGORY_ID: string;
  // Autonomous-editing knobs (all optional; defaults keep the reviewed-PR model).
  DEFAULT_EDIT_TIER?: string; // tier required to edit a path with no protection.json rule (default "maintainer")
  AUTOCONFIRM_EDITS?: string; // accepted edits for the "auto" tier (default 10)
  AUTOCONFIRM_DAYS?: string; // age in days for the "auto" tier (default 4)
  EXTENDED_EDITS?: string; // accepted edits for the "extended" tier (default 500)
  EXTENDED_DAYS?: string; // age in days for the "extended" tier (default 30)
  HOME_SLUG?: string; // slug treated as the home page (excluded from orphans; default "index")
}

interface EditBody {
  slug?: unknown;
  content?: unknown;
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
      "GET /history": () => history(env, q.get("slug") ?? ""),
      "GET /diff": () =>
        diff(env, q.get("slug") ?? "", q.get("base") ?? "", q.get("head") ?? ""),
      "GET /topics": () => listTopics(env, q.get("slug") ?? ""),
      "GET /topic": () => getThread(env, q.get("id") ?? ""),
      "GET /whoami": () => whoami(env, request),
      "GET /changes": () => listChanges(env, q.get("limit") ?? ""),
      "GET /pending": () => listPending(env),
      "GET /pending-diff": () => pendingDiff(env, q.get("number") ?? ""),
      "POST /edit": async () =>
        proposeEdit(env, request, (await request.json()) as EditBody),
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
  const kv = env.RATE_LIMIT;
  if (!kv) return;
  const existing = await kv.get("meta:index");
  if (!existing) return;
  try {
    const hit = JSON.parse(existing) as { v: IndexMap };
    hit.v[slug] = nodeFromRaw(slug, raw);
    await kv.put("meta:index", JSON.stringify({ v: hit.v, ts: Date.now() }));
  } catch {
    await kv.delete("meta:index");
  }
}

function linkGraph(env: Env) {
  return getIndex(env).then((map) => graphFromMap(map, env.HOME_SLUG ?? "index"));
}

function searchIndex(env: Env) {
  return getIndex(env).then((map) => ({ docs: searchDocsFromMap(map) }));
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

// ── RecentChanges feed + patrol (post-hoc moderation surface) ─────────────
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
  const cached = await env.RATE_LIMIT?.get(key);
  if (cached) return JSON.parse(cached) as ChangeDetail;
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
  await env.RATE_LIMIT?.put(key, JSON.stringify(detail));
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

// Mark a commit reviewed. Maintainer-only, by ip_hash tier — no token needed
// (it only flips a flag).
async function patrol(
  env: Env,
  request: Request,
  body: PatrolBody,
): Promise<{ ok: true }> {
  const sha = String(body.sha ?? "");
  if (!SHA_RE.test(sha)) throw new HttpError(400, "Invalid revision.");
  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const author = `anon-${await ipHash(env.HASH_SECRET, ip)}`;
  if ((await editorTier(env, author)) !== "maintainer")
    throw new HttpError(403, "Patrolling requires maintainer access.");
  await env.RATE_LIMIT?.put(`patrol:${sha}`, "1");
  return { ok: true };
}

// ── In-UI review of pending anonymous edits (open PRs) ────────────────────
interface OutPending {
  number: number;
  author: string;
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

const anonAuthor = (ref: string) => ref.split("/")[0]; // "anon-<hash>/slug-uuid" → "anon-<hash>"

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
  const anon = prs.filter((p) => p.head.ref.startsWith("anon-"));
  const prefix = `${env.CONTENT_DIR}/`;
  const pending = await Promise.all(
    anon.map(async (p) => {
      const files = await prContentFiles(env, p.number);
      return {
        number: p.number,
        author: anonAuthor(p.head.ref),
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

// Merge (squash → live) or close a pending edit. Maintainer-only, by ip_hash.
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

  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const reviewer = `anon-${await ipHash(env.HASH_SECRET, ip)}`;
  if ((await editorTier(env, reviewer)) !== "maintainer")
    throw new HttpError(403, "Reviewing requires maintainer access.");

  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const pr = await gh<{ head: { ref: string }; title: string }>(
    env,
    `/repos/${repo}/pulls/${number}`,
  );
  if (!pr.head.ref.startsWith("anon-"))
    throw new HttpError(400, "Not an anonymous edit.");

  if (action === "merge") {
    await gh(env, `/repos/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash", commit_title: pr.title }),
    });
    await env.RATE_LIMIT?.delete("meta:latest-sha");
    await env.RATE_LIMIT?.delete("meta:pages");
    await env.RATE_LIMIT?.delete("meta:index");
    await env.RATE_LIMIT?.delete(`trust:${anonAuthor(pr.head.ref)}`);
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

// ── Trust tiers & page protection (autonomous editing) ────────────────────
// Tiers form one ordered scale shared by editors and pages: an editor of rank
// ≥ a page's required rank may publish directly. A page's required rank is its
// `protection` frontmatter field (a privileged property — see below).
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

// Privileged page properties: changing one needs at least this tier. (Most
// frontmatter — tags, hatnote, banner… — is open to any editor.)
const PRIVILEGED_FIELDS: Record<string, Tier> = {
  // `protection` is special-cased below (gated by its own value); listed for docs.
};

// Parse just the YAML frontmatter block of a page's markdown.
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
  for (const [field, min] of Object.entries(PRIVILEGED_FIELDS)) {
    const changed =
      JSON.stringify(oldMeta[field] ?? null) !== JSON.stringify(newMeta[field] ?? null);
    if (changed && TIER_RANK[tier] < TIER_RANK[min])
      throw new HttpError(403, `You can't change the "${field}" property.`);
  }
}

// Maintainer allowlist lives at the repo root, same store as bans.json.
async function trustedEditors(env: Env): Promise<string[]> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${env.BRANCH}/trusted-editors.json`,
  );
  if (!res.ok) return [];
  try {
    const list = (await res.json()) as unknown;
    return Array.isArray(list) ? (list as string[]) : [];
  } catch {
    return [];
  }
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
): Promise<{ author: string; tier: Tier }> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const author = `anon-${await ipHash(env.HASH_SECRET, ip)}`;
  return { author, tier: await editorTier(env, author) };
}

const TRUST_TTL_S = 3600;

async function editorTier(env: Env, author: string): Promise<Tier> {
  if ((await trustedEditors(env)).includes(author)) return "maintainer";
  const { n, firstMs } = await trustStats(env, author);
  const days = (Date.now() - firstMs) / 86_400_000;
  const num = (v: string | undefined, d: number) => Number.parseInt(v ?? "", 10) || d;
  if (n >= num(env.EXTENDED_EDITS, 500) && days >= num(env.EXTENDED_DAYS, 30))
    return "extended";
  if (n >= num(env.AUTOCONFIRM_EDITS, 10) && days >= num(env.AUTOCONFIRM_DAYS, 4))
    return "auto";
  return "open";
}

// Read the pseudonym's accepted-edit stats, cached briefly in KV to spare the
// GitHub API on every edit.
async function trustStats(env: Env, author: string): Promise<TrustStats> {
  const key = `trust:${author}`;
  const cached = await env.RATE_LIMIT?.get(key);
  if (cached) {
    const s = JSON.parse(cached) as Partial<TrustStats>;
    if (typeof s.n === "number" && typeof s.firstMs === "number")
      return s as TrustStats;
  }
  const stats = await countAuthored(env, author);
  await env.RATE_LIMIT?.put(key, JSON.stringify(stats), { expirationTtl: TRUST_TTL_S });
  return stats;
}

// `?author=<email>` filters commits by the pseudonym's authoring email; with
// per_page=1 the Link header's `rel="last"` page number is the total count, and
// that last page holds the earliest commit (first-seen).
export function lastPage(link: string): number {
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : 1;
}

async function countAuthored(env: Env, author: string): Promise<TrustStats> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const base = `https://api.github.com/repos/${repo}/commits?author=${encodeURIComponent(
    `${author}@anon.invalid`,
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

  const [tier, current] = await Promise.all([
    editorTier(env, author),
    getCurrentFile(env, repo, path),
  ]);
  const oldMeta = current ? frontmatter(current.raw) : {};
  enforceFieldPermissions(env, tier, oldMeta, frontmatter(content));
  const required = pageTier(env, oldMeta);

  const verdict = await runFilters(env, tier, current?.raw ?? "", content);
  if (verdict.action === "disallow")
    throw new HttpError(422, verdict.message ?? "This edit was blocked by a filter.");

  const filePut = (branch: string) =>
    JSON.stringify({
      message: summary || `Edit ${slug}`,
      content: toBase64(content),
      branch,
      sha: current?.sha,
      author: { name: author, email: `${author}@anon.invalid` },
      committer: { name: `${env.REPO_NAME} bot`, email: "bot@anon.invalid" },
    });

  // Trusted enough for this page → publish straight to the live branch.
  if (TIER_RANK[tier] >= TIER_RANK[required]) {
    const res = await gh<{ commit: { sha: string; html_url: string } }>(
      env,
      `/repos/${repo}/contents/${path}`,
      { method: "PUT", body: filePut(env.BRANCH) },
    );
    // Invalidate cached pointers so the edit is live on the next read, and the
    // author's trust stats so this new commit counts immediately.
    await env.RATE_LIMIT?.delete("meta:latest-sha");
    await env.RATE_LIMIT?.delete("meta:pages");
    await env.RATE_LIMIT?.delete(`trust:${author}`);
    await updateIndexEntry(env, slug, content);
    if (verdict.tags.length)
      await env.RATE_LIMIT?.put(`tag:${res.commit.sha}`, JSON.stringify(verdict.tags));
    return { live: true, sha: res.commit.sha, url: res.commit.html_url, author };
  }

  // Otherwise fall back to the reviewed-PR flow.
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
    body: filePut(branch),
  });
  const pr = await gh<{ html_url: string }>(env, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: summary || `Anonymous edit: ${slug}`,
      head: branch,
      base: env.BRANCH,
      body:
        `Proposed in-site by \`${author}\`.` +
        (verdict.tags.length ? `\n\nFilter tags: ${verdict.tags.join(", ")}` : ""),
    }),
  });

  return { live: false, prUrl: pr.html_url, author };
}

function ghHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": `${env.REPO_NAME}-worker`,
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
const REPLY_MARKER = /<!--\s*reply-to:([A-Za-z0-9_=-]+)\s*-->/;

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

function authorOf(body: string, author: { login: string; avatarUrl: string } | null) {
  const m = body.match(ANON_MARKER);
  return {
    author: m ? m[1] : (author?.login ?? "ghost"),
    isAnon: Boolean(m),
    avatarUrl: m ? null : (author?.avatarUrl ?? null),
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

  const author = await authenticateAnon(env, request, body.token);
  const created = await ghGraphQL<{ createDiscussion: { discussion: { id: string } } }>(
    env,
    CREATE_DISCUSSION,
    {
      repo: env.REPO_ID,
      cat: env.DISCUSSION_CATEGORY_ID,
      title: topicPrefix(slug) + title,
      body: `<!-- anon:${author} -->\n\n${text}`,
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

  const author = await authenticateAnon(env, request, body.token);
  const marker = `<!-- anon:${author} -->${replyTo ? `\n<!-- reply-to:${replyTo} -->` : ""}`;
  await ghGraphQL(env, ADD_COMMENT, { d: topicId, body: `${marker}\n\n${text}` });
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
