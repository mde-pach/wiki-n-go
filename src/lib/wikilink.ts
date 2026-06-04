import type MarkdownIt from "markdown-it";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/^-+|-+$/g, "");
}
