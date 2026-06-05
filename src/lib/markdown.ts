import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import { wikilink } from "./wikilink";

// Shared markdown-it instance (no DOMPurify, so it runs at build/SSR too).
export const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(anchor, {
    level: [2, 3, 4],
    slugify: slugifyHeading,
    permalink: anchor.permalink.ariaHidden({
      symbol: "#",
      placement: "after",
      class: "anchor-link",
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

export interface ParsedPage {
  title: string;
  html: string;
}

// Split off the leading `# Title` (it lives in the chrome) and render the rest.
export function parsePage(raw: string): ParsedPage {
  const m = raw.match(/^#\s+(.+?)\s*$/m);
  const body = m ? raw.replace(m[0], "").trimStart() : raw;
  return { title: m ? m[1] : "", html: md.render(body) };
}
