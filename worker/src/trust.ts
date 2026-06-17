import { parse as parseYaml } from "yaml";
import { type CommitItem, ghHeaders, repoJson } from "./github";
import { HttpError } from "./http";
import { cached, kvGetJson, kvPutJson } from "./kv";
import { sanitizeConfig } from "./siteconfig";
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

// Maintainers declared in `wikigit.json` (the owner-editable settings form).
// Same grant as `trusted-editors.json` — the two are unioned, so an owner can
// manage maintainers from settings without touching the imperative grant path.
async function configMaintainers(env: Env): Promise<string[]> {
  const cfg = await repoJson<unknown>(env, "wikigit.json");
  return sanitizeConfig(cfg).maintainers ?? [];
}

// Every maintainer's identity key — the owner, the trusted-editors list and the
// config maintainers, unioned + normalized (a bare login → `gh:<login>`, matching
// isMaintainer). Used to notify maintainers of a pending review.
export async function maintainerKeys(env: Env): Promise<string[]> {
  const [trusted, configM] = await Promise.all([
    trustedEditors(env),
    configMaintainers(env),
  ]);
  const toKey = (e: string) => (/^(gh:|wg:|anon-)/.test(e) ? e : `gh:${e}`);
  const set = new Set<string>([`gh:${env.REPO_OWNER}`]);
  for (const e of [...trusted, ...configM]) set.add(toKey(e));
  return [...set];
}

// editorTier runs on every admin action and publish; the maintainer set rarely
// changes, so cache it briefly to spare two CDN reads per call. Grant/revoke
// busts "maintainers:set" so a change still takes effect promptly.
const MAINTAINER_SET_TTL_MS = 60_000;
export function cachedMaintainerKeys(env: Env): Promise<string[]> {
  return cached(env, "maintainers:set", MAINTAINER_SET_TTL_MS, () =>
    maintainerKeys(env),
  );
}

// Maintainer status is keyed on the **provider-qualified** identity key
// (`gh:<login>` / `wg:<sub>` / `anon-<hash>`), never the display name — a
// self-chosen Wikigit handle equal to the owner's GitHub login (or a trusted
// login) must NOT inherit their rights. The owner is the GitHub identity
// `gh:<REPO_OWNER>`. Legacy allowlist entries without a provider prefix are
// read as GitHub logins (`gh:<entry>`) for backward compatibility.
export function isMaintainer(key: string, owner: string, trusted: string[]): boolean {
  if (key === `gh:${owner}`) return true;
  const toKey = (e: string) => (/^(gh:|wg:|anon-)/.test(e) ? e : `gh:${e}`);
  return trusted.map(toKey).includes(key);
}

const TRUST_TTL_S = 3600;

// Trust tier from accepted-edit history. `key` is the provider-qualified
// identity (maintainer check + cache key); `email` is the commit-author filter.
// Anonymous and signed-in identities share the exact same machinery and thresholds.
export async function editorTier(env: Env, email: string, key: string): Promise<Tier> {
  if ((await cachedMaintainerKeys(env)).includes(key)) return "maintainer";
  const { n, firstMs } = await trustStats(env, email, key);
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
async function trustStats(env: Env, email: string, idKey: string): Promise<TrustStats> {
  const key = `trust:${idKey}`;
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
  const res = await fetch(base, { headers: await ghHeaders(env) });
  if (!res.ok) return { n: 0, firstMs: Date.now() };
  const page = (await res.json()) as CommitItem[];
  if (page.length === 0) return { n: 0, firstMs: Date.now() };
  const n = lastPage(res.headers.get("Link") ?? "");
  let firstMs = new Date(page[0].commit.author.date).getTime();
  if (n > 1) {
    const oldest = await fetch(`${base}&page=${n}`, { headers: await ghHeaders(env) });
    if (oldest.ok) {
      const last = (await oldest.json()) as CommitItem[];
      if (last[0]) firstMs = new Date(last[0].commit.author.date).getTime();
    }
  }
  return { n, firstMs };
}
