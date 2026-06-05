import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
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
  .use(footnote)
  .use(wikilink);

// Render footnotes with the design's citation markup so the existing
// `.cite-ref` / `.ref-list` styles apply (Wikipedia-style `[1]` + reflist).
const citeMark = (n: number, sub: number) => `cite-${n}-${sub + 1}`;
md.renderer.rules.footnote_ref = (tokens, idx) => {
  const n = tokens[idx].meta.id + 1;
  const mark = citeMark(n, tokens[idx].meta.subId);
  return `<a class="cite-ref" id="${mark}" href="#ref-${n}" aria-label="Citation ${n}">${n}</a>`;
};
md.renderer.rules.footnote_block_open = () =>
  '<section class="references" aria-label="References"><ol class="ref-list">\n';
md.renderer.rules.footnote_block_close = () => "</ol></section>\n";
md.renderer.rules.footnote_open = (tokens, idx) =>
  `<li id="ref-${tokens[idx].meta.id + 1}" class="ref-target">`;
md.renderer.rules.footnote_close = () => "</li>\n";
md.renderer.rules.footnote_anchor = (tokens, idx) => {
  const n = tokens[idx].meta.id + 1;
  return ` <a href="#${citeMark(n, tokens[idx].meta.subId)}" class="ref-backlink" aria-label="Back to text">↑</a>`;
};

function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface ParsedPage {
  title: string;
  html: string;
  headings: Heading[];
}

// The leading `# Title` lives in the chrome, not the body. Split it off so both
// the SSR pages and the client renderer share one rule.
export function splitTitle(raw: string): { title: string; body: string } {
  const m = raw.match(/^#\s+(.+?)\s*$/m);
  return { title: m ? m[1] : "", body: m ? raw.replace(m[0], "").trimStart() : raw };
}

// Render the body and pull out the heading outline so the TOC can render
// server-side too.
export function parsePage(raw: string): ParsedPage {
  const { title, body } = splitTitle(raw);
  const html = md.render(body);
  const headings: Heading[] = [];
  const re = /<h([23]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/g;
  let h = re.exec(html);
  while (h) {
    headings.push({
      id: h[2],
      level: Number(h[1]),
      text: h[3]
        .replace(/<[^>]+>/g, "")
        .replace(/#\s*$/, "")
        .trim(),
    });
    h = re.exec(html);
  }
  return { title, html, headings };
}
