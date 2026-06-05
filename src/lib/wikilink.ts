import type MarkdownIt from "markdown-it";
import { BASE } from "./paths";

// `[[Target]]` / `[[Target|Label]]` → internal link carrying a data-slug, which
// the reader uses to flag red links (pages that don't exist yet).
export function wikilink(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf("]]", pos + 2);
    if (end < 0) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner || /[[\]\n]/.test(inner)) return false;

    const [target, label] = inner.split("|");

    const iw = interwiki(target.trim());
    if (iw) {
      if (!silent) {
        const open = state.push("link_open", "a", 1);
        open.attrSet("href", iw.href);
        open.attrSet("class", "wikilink interwiki");
        open.attrSet("target", "_blank");
        open.attrSet("rel", "noreferrer");
        open.attrSet("title", `${iw.title} on Wikipedia`);
        state.push("text", "", 0).content = (label ?? iw.title).trim();
        state.push("link_close", "a", -1);
      }
      state.pos = end + 2;
      return true;
    }

    const slug = slugify(target.trim());
    if (!slug) return false;

    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrSet("href", `${BASE}/${slug}`);
      open.attrSet("class", "wikilink");
      open.attrSet("data-slug", slug);
      state.push("text", "", 0).content = (label ?? target).trim();
      state.push("link_close", "a", -1);
    }
    state.pos = end + 2;
    return true;
  });
}

// `[[w:Title]]` / `[[wikipedia:Title]]` → an interwiki link out to Wikipedia,
// for topics already covered there that we don't keep a local page for.
function interwiki(target: string): { href: string; title: string } | null {
  const m = target.match(/^(?:w|wikipedia):(.+)$/i);
  if (!m) return null;
  const title = m[1].trim();
  if (!title) return null;
  return {
    href: encodeURI(`https://en.wikipedia.org/wiki/${title.replace(/\s+/g, "_")}`),
    title,
  };
}

// Build-time pass: flag wikilinks whose target page doesn't exist so they paint
// red on first load instead of flashing blue until the client manifest arrives.
export function markRedLinksHtml(html: string, exists: Set<string>): string {
  return html.replace(
    /<a href="[^"]*" class="wikilink" data-slug="([^"]+)">/g,
    (whole, slug) =>
      exists.has(slug)
        ? whole
        : whole.replace(
            'class="wikilink"',
            'class="wikilink is-red" title="Page does not exist yet — click to create"',
          ),
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/^-+|-+$/g, "");
}
