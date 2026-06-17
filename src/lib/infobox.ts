import type { InfoboxRow, PageMeta } from "./frontmatter";
import { prettify } from "./paths";

// Type-only import of frontmatter above (no `yaml`): defining normalizeRow here,
// instead of importing the value, keeps the read island's eager bundle off the
// frontmatter/yaml chunk, which only the lazy markdown path needs.
function normalizeRow(value: string | InfoboxRow): InfoboxRow {
  return typeof value === "string" ? { v: value } : value;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

// Infobox HTML is hand-built and `esc()` only entity-escapes — it does *not*
// touch a URL's scheme, so a bare `javascript:alert(1)` (no quotes to escape)
// would survive in an href/src and run. Frontmatter is anon-editable, so drop
// any URL whose scheme isn't safe; scheme-less, root/protocol-relative, anchor
// and query URLs are fine. Returns undefined for an unsafe URL (caller omits it).
export const safeUrl = (raw: string): string | undefined => {
  // Browsers strip tab/newline/CR from URLs before parsing, so `java\tscript:`
  // becomes `javascript:` — strip them too or the scheme check is bypassable.
  const s = raw.replace(/[\t\r\n]/g, "").trim();
  if (/^(\/\/|\/|#|\?)/.test(s)) return s; // protocol-relative / root / anchor / query
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return s; // no scheme → relative path
  return /^(https?|mailto):/i.test(s) ? s : undefined; // has a scheme → allowlist
};

const isImageUrl = (s: string) => /^(https?:|\/)|\.(png|jpe?g|gif|svg|webp)$/i.test(s);

// The quick-facts card, as an HTML string baked into the article body as its
// first child — so it floats inside the prose flow (a real sibling of the
// paragraphs/lists) and the text wraps around it without sliding underneath
// (which it does when the card is a separate island outside the content). Mirrors
// the markup the editor's properties form writes; returns "" when there are no
// custom `infobox:` rows so plain pages are untouched.
export function infoboxHtml(slug: string, meta: PageMeta = {}): string {
  const ib = meta.infobox;
  const rows = ib
    ? Object.entries(ib).map(([k, v]) => ({ k, ...normalizeRow(v) }))
    : [];
  if (rows.length === 0) return "";

  const imgSrc = meta.image ? safeUrl(meta.image) : undefined;
  const fig = meta.image
    ? imgSrc && isImageUrl(imgSrc)
      ? `<div class="infobox-fig"><img src="${esc(imgSrc)}" alt="" /></div>`
      : `<div class="infobox-fig"><div class="img-placeholder" style="height:130px"><span>${esc(meta.image)}</span></div></div>`
    : "";

  const body = rows
    .map((r) => {
      const cls = r.mono ? ' class="mono"' : "";
      const href = r.link ? safeUrl(r.link) : undefined;
      const val = href
        ? `<a${cls} href="${esc(href)}" target="_blank" rel="noreferrer">${esc(r.v)}</a>`
        : `<span${cls}>${esc(r.v)}</span>`;
      return `<div class="ib-row"><dt>${esc(r.k)}</dt><dd>${val}</dd></div>`;
    })
    .join("");

  return (
    `<aside class="infobox" aria-label="Quick facts">` +
    `<div class="infobox-cap"><div class="ib-kicker">${esc(meta.kicker ?? "Wiki page")}</div>` +
    `<div class="ib-title">${esc(prettify(slug))}</div></div>` +
    fig +
    `<dl>${body}</dl>` +
    `<div class="infobox-foot">Frontmatter-driven · stored as YAML in the page's source.</div>` +
    `</aside>`
  );
}
