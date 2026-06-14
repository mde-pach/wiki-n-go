import { config } from "../config";
import { activeRepo, engineUrl } from "./engine";
import { bootTenant } from "./tenant";

export class PageNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Page not found: ${slug}`);
    this.name = "PageNotFoundError";
  }
}

// Resolve via the Worker (edge + KV cached, authenticated quota) when set, else
// the GitHub API. `no-store` stops the browser pinning a stale SHA after a merge.
export async function resolveLatestSha(): Promise<string> {
  await bootTenant();
  if (config.workerUrl) {
    try {
      const res = await fetch(engineUrl("/latest"), { cache: "no-store" });
      if (res.ok) return ((await res.json()) as { sha: string }).sha;
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
  return (await res.text()).trim();
}

export function cdnUrl(sha: string, slug: string): string {
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
