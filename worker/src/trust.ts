import { parse as parseYaml } from "yaml";
import { type CommitItem, ghHeaders, repoJson } from "./github";
import { HttpError } from "./http";
import { kvGetJson, kvPutJson } from "./kv";
import type { Env } from "./types";

// Tiers form one ordered scale shared by editors and pages: an editor of rank
// ≥ a page's required rank may publish directly.
export type Tier = "open" | "auto" | "extended" | "maintainer";
export const TIER_RANK: Record<Tier, number> = {
  open: 0,
  auto: 1,
  extended: 2,
  maintainer: 3,
};
export const asTier = (s: string | undefined, fallback: Tier): Tier =>
  s && s in TIER_RANK ? (s as Tier) : fallback;

// An editor's accepted-edit record, derived from git history (cached). Both
// direct commits and merged PRs land on the branch as commits authored by the
// pseudonym, so counting them is the single source of truth — no ledger to keep.
export interface TrustStats {
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
export function enforceFieldPermissions(
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

const TRUST_TTL_S = 3600;

// Trust tier from accepted-edit history. `name` matches the maintainer
// allowlist + caches the result; `email` is the commit-author filter. Anonymous
// and signed-in identities share the exact same machinery and thresholds.
export async function editorTier(env: Env, name: string, email: string): Promise<Tier> {
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
