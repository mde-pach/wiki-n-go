import { repoJson } from "./github";
import type { Env } from "./types";

// A ban is either a bare key (site-wide block, the original format) or an object
// carrying an optional path scope + provenance. `paths` makes it a *partial*
// block: the key may edit everywhere except those subtrees.
export type RawBan =
  | string
  | { key: string; paths?: string[]; reason?: string; by?: string; at?: string };

export interface NormalBan {
  key: string;
  paths: string[];
  reason?: string;
  by?: string;
  at?: string;
}

export function normalizeBan(e: RawBan): NormalBan {
  if (typeof e === "string") return { key: e, paths: [] };
  return {
    key: e.key,
    paths: Array.isArray(e.paths) ? e.paths : [],
    reason: e.reason,
    by: e.by,
    at: e.at,
  };
}

// Compact site-wide bans with no metadata back to a bare string so bans.json
// stays readable and the original hand-edited format round-trips.
export function serializeBan(b: NormalBan): RawBan {
  if (b.paths.length === 0 && !b.reason && !b.by && !b.at) return b.key;
  return {
    key: b.key,
    ...(b.paths.length ? { paths: b.paths } : {}),
    ...(b.reason ? { reason: b.reason } : {}),
    ...(b.by ? { by: b.by } : {}),
    ...(b.at ? { at: b.at } : {}),
  };
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
  if (b.paths.length === 0) return true;
  return slug !== undefined && b.paths.some((p) => pathMatches(p, slug));
}

export function parseBans(raw: string | undefined): NormalBan[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.map((e) => normalizeBan(e as RawBan)) : [];
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
