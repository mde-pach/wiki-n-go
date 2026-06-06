import { repoJson } from "./github";
import type { Env } from "./types";

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

export function parseSuppressions(raw: string | undefined): Suppression[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (s): s is Suppression =>
        !!s &&
        ((s as Suppression).type === "author" ||
          (s as Suppression).type === "revision") &&
        typeof (s as Suppression).value === "string",
    );
  } catch {
    return [];
  }
}

export async function loadSuppressions(env: Env): Promise<Suppression[]> {
  const list = await repoJson<unknown>(env, "suppressed.json");
  return parseSuppressions(Array.isArray(list) ? JSON.stringify(list) : undefined);
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
