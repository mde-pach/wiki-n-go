import { config } from "../config";
import { engineUrl } from "./engine";
import type { Revision } from "./history";

// Request-time helpers for the optional edge-SSR variant (SPEC §8/M4). They run
// server-side at the edge — fetching content from jsDelivr@sha and page state
// from the Worker per request — so the content route renders real HTML for
// crawlers and emits a real noindex, without a per-commit rebuild. The static
// GitHub Pages path never imports this (it renders from the build-time glob).

// The set of existing slugs, fetched fresh per request (no module-level cache,
// which would go stale in a warm edge isolate) so red links resolve correctly.
export async function fetchPageSlugs(): Promise<Set<string>> {
  if (!config.workerUrl) return new Set();
  try {
    const res = await fetch(engineUrl("/pages"), { cache: "no-store" });
    if (!res.ok) return new Set();
    return new Set(((await res.json()) as { pages: string[] }).pages);
  } catch {
    return new Set();
  }
}

// The revision history, from the Worker, so the SSR path can server-render the
// "last edited" line (the static path reads local git at build via gitRevisions,
// which can't run at the edge). Fails soft to [] → the client island refetches.
export async function fetchRevisions(slug: string): Promise<Revision[]> {
  if (!config.workerUrl) return [];
  try {
    const res = await fetch(engineUrl(`/history?slug=${encodeURIComponent(slug)}`), {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return ((await res.json()) as { revisions: Revision[] }).revisions;
  } catch {
    return [];
  }
}

// noindex-until-patrolled, resolved server-side on the SSR path. Fails OPEN
// (false → indexable) when the Worker is unset or unreachable, matching the
// client-side fail-open invariant: a Worker/KV hiccup never deindexes the wiki.
export async function pageNoindex(slug: string): Promise<boolean> {
  if (!config.workerUrl) return false;
  try {
    const res = await fetch(
      engineUrl(`/patrol-status?slug=${encodeURIComponent(slug)}`),
      { cache: "no-store" },
    );
    if (!res.ok) return false;
    return !((await res.json()) as { patrolled: boolean }).patrolled;
  } catch {
    return false;
  }
}
