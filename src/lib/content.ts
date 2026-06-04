import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import { config } from "../config";
import { wikilink } from "./wikilink";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(anchor, {
    slugify: slugifyHeading,
    permalink: anchor.permalink.ariaHidden({
      symbol: "#",
      placement: "after",
      class: "header-anchor",
    }),
  })
  .use(wikilink);

function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export class PageNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Page not found: ${slug}`);
    this.name = "PageNotFoundError";
  }
}

// Resolve via the Worker (edge + KV cached, authenticated quota) when set, else
// the GitHub API. `no-store` stops the browser pinning a stale SHA after a merge.
export async function resolveLatestSha(): Promise<string> {
  if (config.workerUrl) {
    try {
      const res = await fetch(`${config.workerUrl}/latest`, { cache: "no-store" });
      if (res.ok) return ((await res.json()) as { sha: string }).sha;
    } catch {
      // fall back to the GitHub API below
    }
  }
  const res = await fetch(
    `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/commits/${config.branch}`,
    { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Could not resolve latest commit (HTTP ${res.status}).`);
  return (await res.text()).trim();
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
