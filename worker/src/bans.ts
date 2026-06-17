import { repoJson } from "./github";
import type { Env } from "./types";

// A ban is either a bare key (site-wide block, the original format) or an object
// carrying an optional path scope + provenance. `paths` makes it a *partial*
// block: the key may edit everywhere except those subtrees.
export type RawBan =
  | string
  | {
      key: string;
      paths?: string[];
      reason?: string;
      by?: string;
      at?: string;
      // ISO timestamp; once past, the ban is treated as absent (lazy expiry, no
      // cron) — Wikipedia's overwhelming default is a *temporary* block.
      expires?: string;
    };

export interface NormalBan {
  key: string;
  paths: string[];
  reason?: string;
  by?: string;
  at?: string;
  expires?: string;
}

export function normalizeBan(e: RawBan): NormalBan {
  if (typeof e === "string") return { key: e, paths: [] };
  return {
    key: e.key,
    paths: Array.isArray(e.paths) ? e.paths : [],
    reason: e.reason,
    by: e.by,
    at: e.at,
    expires: e.expires,
  };
}

// Compact site-wide bans with no metadata back to a bare string so bans.json
// stays readable and the original hand-edited format round-trips.
export function serializeBan(b: NormalBan): RawBan {
  if (b.paths.length === 0 && !b.reason && !b.by && !b.at && !b.expires) return b.key;
  return {
    key: b.key,
    ...(b.paths.length ? { paths: b.paths } : {}),
    ...(b.reason ? { reason: b.reason } : {}),
    ...(b.by ? { by: b.by } : {}),
    ...(b.at ? { at: b.at } : {}),
    ...(b.expires ? { expires: b.expires } : {}),
  };
}

// A ban with an `expires` in the past no longer applies. Invalid dates are
// ignored (treated as no expiry) so a hand-typo can't silently lift a block.
export function banExpired(b: NormalBan, now: number = Date.now()): boolean {
  if (!b.expires) return false;
  const t = Date.parse(b.expires);
  return Number.isFinite(t) && t <= now;
}

// Normalize a console-supplied expiry to a stored ISO timestamp: accept a
// relative duration (`24h`, `7d`, `2w`, `90m`) or an absolute ISO date.
// Returns undefined for empty/garbage (→ an indefinite block).
const DURATION_RE = /^(\d+)\s*(m|h|d|w)$/i;
const DURATION_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};
export function parseExpiry(
  input: string,
  now: number = Date.now(),
): string | undefined {
  const s = input.trim();
  if (!s) return undefined;
  const m = s.match(DURATION_RE);
  if (m)
    return new Date(now + Number(m[1]) * DURATION_MS[m[2].toLowerCase()]).toISOString();
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function pathMatches(pattern: string, slug: string): boolean {
  const base = pattern.replace(/\/+$/, "");
  return slug === base || slug.startsWith(`${base}/`);
}

// Does this ban block `key` for an edit to `slug`? Site-wide bans always block;
// a partial (path-scoped) ban blocks only its subtrees, and only when the action
// carries a path (edits/moves do, comments don't → partial bans don't gag talk).
export function banApplies(b: NormalBan, key: string, slug?: string): boolean {
  if (b.key !== key) return false;
  if (banExpired(b)) return false;
  if (b.paths.length === 0) return true;
  return slug !== undefined && b.paths.some((p) => pathMatches(p, slug));
}

export function parseBans(raw: string | undefined): NormalBan[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    // Drop entries with no usable key: a corrupted object would normalize to a
    // keyless ban that silently matches nothing (fail-open) — better to ignore it.
    return list
      .map((e) => normalizeBan(e as RawBan))
      .filter((b) => typeof b.key === "string" && b.key.length > 0);
  } catch {
    return [];
  }
}

// Hot-path check (every write): reads bans.json off the CDN, which lags a few
// minutes behind a fresh ban — acceptable for coarse abuse control. The write
// path (ban/unban) reads through the API for an authoritative sha instead.
export async function isBanned(env: Env, key: string, slug?: string): Promise<boolean> {
  const list = await repoJson<RawBan[]>(env, "bans.json");
  if (!Array.isArray(list)) return false;
  return list.map(normalizeBan).some((b) => banApplies(b, key, slug));
}
