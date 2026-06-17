import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import { citeTemplate } from "./citetemplate";
import { directiveImage } from "./directiveimage";
import { figures } from "./figures";
import { type PageMeta, splitTitle } from "./frontmatter";
import { langOf, slugifyLabel, viewHref } from "./paths";
import { transclusion } from "./transclude";
import { escapeRegExp } from "./util";
import { markRedLinksHtml, mention, wikilink } from "./wikilink";

// Shared markdown-it instance (no DOMPurify, so it runs at build/SSR too).
//
// XSS invariant — read before adding a plugin. The SSR/static paths inject
// md.render() output via `set:html` with NO sanitizer (DOMPurify needs a DOM;
// the edge-SSR Worker has none), and renderMarkdown's client-side DOMPurify is
// defense-in-depth, not the only line. So md output must be safe BY CONSTRUCTION:
//   • html:false drops raw HTML in source;
//   • markdown-it's default validateLink blocks javascript:/data: in [](links);
//   • every custom plugin below MUST escapeHtml each attribute value it emits and
//     must never emit a user-controlled event handler (onerror=…) or scheme.
// A plugin that emits an unescaped href/src is an SSR-only XSS the client path
// would silently scrub — don't rely on that.
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
  .use(directiveImage)
  .use(figures)
  .use(wikilink)
  .use(mention)
  .use(citeTemplate)
  .use(transclusion);

// markdown-it-footnote emits one backlink per reference. When a note is reused
// (a named ref cited more than once) Wikipedia labels its backlinks a, b, c; flag
// each anchor whose note has siblings so the renderer can letter them.
md.core.ruler.after("footnote_tail", "footnote_backref_labels", (state) => {
  const counts = new Map<number, number>();
  for (const t of state.tokens) {
    if (t.type === "footnote_anchor")
      counts.set(t.meta.id, (counts.get(t.meta.id) ?? 0) + 1);
  }
  for (const t of state.tokens) {
    if (t.type === "footnote_anchor") t.meta.many = (counts.get(t.meta.id) ?? 0) > 1;
  }
});

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
  const { id, subId, many } = tokens[idx].meta;
  const n = id + 1;
  const label = many ? `↑<sup>${String.fromCharCode(97 + (subId % 26))}</sup>` : "↑";
  return ` <a href="#${citeMark(n, subId)}" class="ref-backlink" aria-label="Back to text">${label}</a>`;
};

// Plain `![]()` images load lazily and decode off the main thread — they're
// almost never above the fold, and eager decoding competes with first paint.
// (The `::image` directive sets these on its own <img>.)
const defaultImage =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.attrIndex("loading") < 0) token.attrPush(["loading", "lazy"]);
  if (token.attrIndex("decoding") < 0) token.attrPush(["decoding", "async"]);
  return defaultImage(tokens, idx, options, env, self);
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

// Re-exported for callers that already import it from here; defined in
// frontmatter.ts so the read/preview paths can use it without markdown-it.
export { splitTitle };

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
          : `<a class="section-edit" href="${viewHref("edit", slug)}?section=${encodeURIComponent(id)}">edit</a>`;
      return `<${tag} id="${id}"${attrs}>${toggle}${inner}${edit}</${tag}>`;
    },
  );
}

// The full article-decoration pipeline shared by the static page, the edge-SSR
// page, and the client renderer: resolve red links for the reading language,
// bake heading toggles + `[edit]` links, then emphasize the lead term. One rule
// in one place so every render path produces identical first-paint HTML.
export function decorateArticleHtml(
  html: string,
  slugs: Set<string>,
  slug: string,
  title: string,
): string {
  return emphasizeLeadHtml(
    decorateHeadingsHtml(markRedLinksHtml(html, slugs, langOf(slug)), slug),
    title,
  );
}
