import { config } from "../config";
import { onSwapReset } from "./cache-reset";
import { activeRepo, engineUrl } from "./engine";
import { bootTenant } from "./tenant";

export class PageNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Page not found: ${slug}`);
    this.name = "PageNotFoundError";
  }
}

// The head SHA plus a per-page content-version map (`slug → git blob sha`), so a
// build-time page can tell whether its baked copy is still current without
// fetching the file. The blob sha changes iff the page's bytes change.
export interface Versions {
  sha: string;
  versions: Record<string, string>;
}

// One resolution per page view, shared by the article, every transclusion and
// every hovercard (they'd otherwise each re-fetch). Cleared on the router swap
// that follows an in-site edit so the next view re-resolves the post-merge state.
let versionsCache: Promise<Versions> | undefined;
onSwapReset(() => {
  versionsCache = undefined;
});

export function resolveVersions(): Promise<Versions> {
  if (!versionsCache) {
    versionsCache = resolveVersionsUncached();
    versionsCache.catch(() => {
      versionsCache = undefined;
    });
  }
  return versionsCache;
}

export function resolveLatestSha(): Promise<string> {
  return resolveVersions().then((v) => v.sha);
}

// `no-store` stops the browser pinning a stale SHA after a merge; the in-flight
// memo above, not the HTTP cache, is what coalesces the per-view fan-out. Without
// a Worker we can still resolve the head SHA from GitHub, but not per-page blob
// shas — an empty map means every page is treated as stale (fetched), exactly the
// pre-staleness-check behavior.
async function resolveVersionsUncached(): Promise<Versions> {
  await bootTenant();
  if (config.workerUrl) {
    try {
      const res = await fetch(engineUrl("/version"), { cache: "no-store" });
      if (res.ok) return (await res.json()) as Versions;
    } catch {
      // fall back to the GitHub API below
    }
  }
  const { owner, name } = activeRepo();
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/commits/${config.branch}`,
    { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Could not resolve latest commit (HTTP ${res.status}).`);
  return { sha: (await res.text()).trim(), versions: {} };
}

function cdnUrl(sha: string, slug: string): string {
  const path = `${config.contentDir}/${slug}.md`;
  const { owner, name } = activeRepo();
  return `https://cdn.jsdelivr.net/gh/${owner}/${name}@${sha}/${path}`;
}

export async function fetchMarkdown(slug: string): Promise<string> {
  return fetchMarkdownAt(slug, await resolveLatestSha());
}

// Fetch a page pinned to a specific commit SHA (permalink to a revision).
export async function fetchMarkdownAt(slug: string, sha: string): Promise<string> {
  await bootTenant();
  const res = await fetch(cdnUrl(sha, slug));
  if (res.status === 404) throw new PageNotFoundError(slug);
  if (!res.ok) throw new Error(`Failed to fetch content (HTTP ${res.status}).`);
  return res.text();
}
