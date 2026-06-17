import { repoJson } from "./github";
import { cached } from "./kv";
import type { Env } from "./types";

const SUPPRESSIONS_CACHE_KEY = "meta:suppressions";
const SUPPRESSIONS_TTL_MS = 60_000;

// Oversight: hide a vandal's pseudonym or a specific revision from the
// public-facing feeds (Recent changes, History) at render time. The Worker
// redacts before the data leaves it, so suppressed labels never reach the page
// source. (Full hard-purge — rewriting git history — stays a manual owner op.)
export interface Suppression {
  type: "author" | "revision";
  value: string;
  reason?: string;
  by?: string;
  at?: string;
}

function isSuppression(s: unknown): s is Suppression {
  return (
    !!s &&
    ((s as Suppression).type === "author" || (s as Suppression).type === "revision") &&
    typeof (s as Suppression).value === "string"
  );
}

export function parseSuppressions(raw: string | undefined): Suppression[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter(isSuppression) : [];
  } catch {
    return [];
  }
}

// Read by every public feed (Recent changes, History, pending, contributions),
// so cache it briefly and filter the parsed array in place rather than re-fetch +
// re-stringify + re-parse on each request. The 60s window matches `s-maxage` on
// those routes; the suppress/unsuppress handlers bust it for promptness.
export async function loadSuppressions(env: Env): Promise<Suppression[]> {
  return cached(env, SUPPRESSIONS_CACHE_KEY, SUPPRESSIONS_TTL_MS, async () => {
    const list = await repoJson<unknown>(env, "suppressed.json");
    return Array.isArray(list) ? list.filter(isSuppression) : [];
  });
}

export async function invalidateSuppressions(env: Env): Promise<void> {
  await env.RATE_LIMIT?.delete(SUPPRESSIONS_CACHE_KEY);
}

export interface Redactor {
  author: (name: string) => string;
  revisionSummary: (sha: string, message: string) => string;
}

const HIDDEN = "[suppressed]";

export function makeRedactor(suppressions: Suppression[]): Redactor {
  const authors = new Set(
    suppressions.filter((s) => s.type === "author").map((s) => s.value),
  );
  const revs = new Set(
    suppressions.filter((s) => s.type === "revision").map((s) => s.value),
  );
  return {
    author: (name) => (authors.has(name) ? HIDDEN : name),
    revisionSummary: (sha, message) => (revs.has(sha) ? HIDDEN : message),
  };
}
