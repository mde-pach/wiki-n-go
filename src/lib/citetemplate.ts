import type MarkdownIt from "markdown-it";

export type CiteParams = Record<string, string>;

// Parse a `{{cite|url=…|title=…}}` body (the part between the braces) into its
// fields. The first pipe-segment is the template name (`cite`, `cite web`, …)
// and is required; the rest are `key=value` pairs. Returns null when it isn't a
// cite template so the markdown rule can fall through.
export function parseCiteTemplate(inner: string): CiteParams | null {
  const parts = inner.split("|").map((s) => s.trim());
  if (!/^cite\b/i.test(parts[0])) return null;
  const params: CiteParams = {};
  for (const part of parts.slice(1)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key) params[key] = value;
  }
  return params;
}

const first = (p: CiteParams, ...keys: string[]): string => {
  for (const k of keys) if (p[k]) return p[k];
  return "";
};

// Format parsed cite fields into a footnote-ready Markdown reference. Fields are
// the common Wikipedia ones; everything is optional and missing parts are simply
// dropped, so a sparse `{{cite|url=…}}` still renders cleanly.
export function formatCitation(p: CiteParams): string {
  const url = first(p, "url");
  const title = first(p, "title");
  const author =
    first(p, "author", "authors", "last") +
    (p.first && (p.last || p.author) ? `, ${p.first}` : "");
  const site = first(p, "work", "website", "journal", "publisher", "site");
  const date = first(p, "date", "year");

  const out: string[] = [];
  if (author) out.push(endDot(author));
  if (title) out.push(endDot(url ? `[${title}](${url})` : `“${title}”`));
  else if (url) out.push(endDot(`<${url}>`));
  if (site) out.push(endDot(`*${site}*`));
  if (date) out.push(`(${date}).`);
  return out.join(" ").trim();
}

const endDot = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

type FootnoteEnv = {
  footnotes?: {
    list?: { content: string; tokens: unknown[]; count?: number }[];
    refs?: Record<string, number>;
  };
};

// `{{cite|…}}` → a footnote reference reusing markdown-it-footnote's machinery, so
// citations share the same `[n]` numbering, reference list, backlinks, and hover
// tooltips as `[^name]` footnotes. An optional `ref=`/`id=` lets one citation be
// reused (named-ref style) — repeats render one reflist entry with many backlinks.
// As an inline rule it never fires inside code spans or fenced blocks.
export function citeTemplate(md: MarkdownIt): void {
  md.inline.ruler.before("link", "cite_template", (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x7b || src.charCodeAt(pos + 1) !== 0x7b) return false;
    const end = src.indexOf("}}", pos + 2);
    if (end < 0) return false;
    const params = parseCiteTemplate(src.slice(pos + 2, end));
    if (!params) return false;

    if (!silent) {
      const env = state.env as FootnoteEnv;
      env.footnotes ||= {};
      const fn = env.footnotes;
      fn.list ||= [];
      const list = fn.list;
      const refName = params.ref || params.id;

      let id: number;
      let subId = 0;
      if (refName) {
        fn.refs ||= {};
        const refs = fn.refs;
        const key = `:cite:${refName}`;
        id = refs[key] ?? -1;
        if (id < 0) {
          id = list.length;
          list[id] = makeEntry(state, formatCitation(params));
          refs[key] = id;
        }
        const entry = list[id];
        subId = entry.count ?? 0;
        entry.count = subId + 1;
      } else {
        id = list.length;
        list[id] = makeEntry(state, formatCitation(params));
      }

      const token = state.push("footnote_ref", "", 0);
      token.meta = { id, subId };
    }
    state.pos = end + 2;
    return true;
  });
}

function makeEntry(
  state: Parameters<Parameters<MarkdownIt["inline"]["ruler"]["before"]>[2]>[0],
  content: string,
): { content: string; tokens: unknown[]; count: number } {
  const tokens: unknown[] = [];
  state.md.inline.parse(content, state.md, state.env, tokens as never);
  return { content, tokens, count: 0 };
}
