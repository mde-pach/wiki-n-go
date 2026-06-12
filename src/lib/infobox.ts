import { normalizeRow, type PageMeta } from "./frontmatter";
import { prettify } from "./paths";

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

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

  const fig = meta.image
    ? isImageUrl(meta.image)
      ? `<div class="infobox-fig"><img src="${esc(meta.image)}" alt="" /></div>`
      : `<div class="infobox-fig"><div class="img-placeholder" style="height:130px"><span>${esc(meta.image)}</span></div></div>`
    : "";

  const body = rows
    .map((r) => {
      const cls = r.mono ? ' class="mono"' : "";
      const val = r.link
        ? `<a${cls} href="${esc(r.link)}" target="_blank" rel="noreferrer">${esc(r.v)}</a>`
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
