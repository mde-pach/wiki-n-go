// Build-time access to the Markdown under content/. One eager glob powers both
// the static-path lists and the raw content the read/edit views server-render.
import { config } from "../config";
import { isLangHome } from "./paths";

const PREFIX = "../../content/";

const raw = import.meta.glob("../../content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function contentSlugs(): string[] {
  return Object.keys(raw).map((p) => p.slice(PREFIX.length).replace(/\.md$/, ""));
}

export function rawPage(slug: string | undefined): string | undefined {
  return slug ? raw[`${PREFIX}${slug}.md`] : undefined;
}

// Edit/history/talk route params, collapsed the same way the read route is so a
// page never lives under a literal `/index` segment — Cloudflare Pages 308-strips
// `…/index` → `…/`, which broke the home's Edit/History/Talk tabs (W4).
export function staticPaths(): { params: { slug: string | undefined } }[] {
  return contentSlugs().map((slug) => ({
    params: { slug: slug === config.homeSlug ? undefined : (isLangHome(slug) ?? slug) },
  }));
}
