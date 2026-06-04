import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { config } from "../config";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

export class PageNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Page not found: ${slug}`);
    this.name = "PageNotFoundError";
  }
}

// Pinning the CDN URL to a SHA serves fresh content with immutable caching.
// Cached per session to stay under GitHub's 60/hr unauthenticated limit.
export async function resolveLatestSha(): Promise<string> {
  const cacheKey = `sha:${config.repoOwner}/${config.repoName}@${config.branch}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/commits/${config.branch}`,
    { headers: { Accept: "application/vnd.github.sha" } },
  );
  if (!res.ok) {
    throw new Error(`Could not resolve latest commit (HTTP ${res.status}).`);
  }
  const sha = (await res.text()).trim();
  sessionStorage.setItem(cacheKey, sha);
  return sha;
}

export function cdnUrl(sha: string, slug: string): string {
  const path = `${config.contentDir}/${slug}.md`;
  return `https://cdn.jsdelivr.net/gh/${config.repoOwner}/${config.repoName}@${sha}/${path}`;
}

export async function fetchMarkdown(slug: string): Promise<string> {
  const sha = await resolveLatestSha();
  const res = await fetch(cdnUrl(sha, slug));
  if (res.status === 404) throw new PageNotFoundError(slug);
  if (!res.ok) throw new Error(`Failed to fetch content (HTTP ${res.status}).`);
  return res.text();
}

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src));
}
