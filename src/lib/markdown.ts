import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import { figures } from "./figures";
import { type PageMeta, parseFrontmatter } from "./frontmatter";
import { BASE, slugifyLabel } from "./paths";
import { escapeRegExp } from "./util";
import { wikilink } from "./wikilink";

// Shared markdown-it instance (no DOMPurify, so it runs at build/SSR too).
export const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(anchor, {
    level: [2, 3, 4],
    slugify: slugifyLabel,
    permalink: anchor.permalink.ariaHidden({
      symbol: "#",
      placement: "after",
      class: "anchor-link",
    }),
  })
  .use(footnote)
  .use(figures)
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

// A ```mermaid fence becomes a placeholder holding the diagram source; the
// client decorator lazy-loads mermaid and renders it (no diagram engine at
// build/SSR or in the base bundle). Without JS, the source shows as a code block.
const defaultFence =
  md.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  if (tokens[idx].info.trim() === "mermaid") {
    return `<pre class="mermaid">${md.utils.escapeHtml(tokens[idx].content)}</pre>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface ParsedPage {
  title: string;
  html: string;
  headings: Heading[];
  meta: PageMeta;
}

// Strip frontmatter, then split the leading `# Title` (it lives in the chrome,
// not the body) so the SSR pages and the client renderer share one rule.
export function splitTitle(raw: string): {
  title: string;
  body: string;
  meta: PageMeta;
} {
  const { meta, body: afterMeta } = parseFrontmatter(raw);
  const m = afterMeta.match(/^#\s+(.+?)\s*$/m);
  return {
    title: m ? m[1] : "",
    body: m ? afterMeta.replace(m[0], "").trimStart() : afterMeta,
    meta,
  };
}

// Render the body and pull out the heading outline so the TOC can render
// server-side too.
export function parsePage(raw: string): ParsedPage {
  const { title, body, meta } = splitTitle(raw);
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
  return { title, html, headings, meta };
}

// Wikipedia leads open by bolding the article's own term ("**Espresso** is …").
// Bold the title only when the first paragraph actually starts with it, so we
// never misfire on a lead that opens some other way.
export function emphasizeLeadHtml(html: string, title: string): string {
  if (!title.trim()) return html;
  const p = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!p) return html;
  const inner = p[1];
  if (/^\s*<(?:strong|b)\b/i.test(inner)) return html; // already emphasized
  const re = new RegExp(`^(\\s*)(${escapeRegExp(title)})`, "i");
  if (!re.test(inner)) return html;
  return html.replace(p[0], `<p>${inner.replace(re, "$1<strong>$2</strong>")}</p>`);
}

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src));
}

// Bake the per-section collapse toggle + `[edit]` link into each heading at
// render time so they're present on first paint instead of popping in when the
// client decorator runs. The toggle's arrow is pure CSS; `decorate` only wires
// the click handler onto the existing button. Edit links (h2/h3) are plain
// anchors needing no JS.
export function decorateHeadingsHtml(html: string, slug: string): string {
  return html.replace(
    /<(h[234]) id="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g,
    (_m, tag, id, attrs, inner) => {
      const label = inner
        .replace(/<a class="anchor-link"[\s\S]*?<\/a>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const toggle = `<button class="section-toggle" type="button" aria-expanded="true" aria-label="Toggle the “${label}” section"></button>`;
      const edit =
        tag === "h4"
          ? ""
          : `<a class="section-edit" href="${BASE}/edit/${slug}?section=${encodeURIComponent(id)}">edit</a>`;
      return `<${tag} id="${id}"${attrs}>${toggle}${inner}${edit}</${tag}>`;
    },
  );
}
