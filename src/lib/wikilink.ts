import type MarkdownIt from "markdown-it";
import { BASE, readHref, resolveWikiSlug, slugifyPath, userHref } from "./paths";

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

    const slug = slugifyPath(target.trim());
    if (!slug) return false;

    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrSet("href", readHref(slug));
      open.attrSet("class", "wikilink");
      open.attrSet("data-slug", slug);
      state.push("text", "", 0).content = (label ?? target).trim();
      state.push("link_close", "a", -1);
    }
    state.pos = end + 2;
    return true;
  });
}

// GitHub login / `anon-<hash>` shape: alphanumerics with internal single hyphens,
// ≤39 chars (GitHub's own rule). `anon-<hash>` pseudonyms satisfy it too.
const MENTION_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}/i;
const ANON_RE = /^anon-[a-z\d]+$/i;
// A `@` only starts a mention at a boundary — never glued to a word, an email
// local part (`me@host`), a path, or a preceding handle.
const MENTION_BLOCK = /[\w@./-]/;

// `@anon-<hash>` and `@<github-login>` in content become links: an anon
// pseudonym to its contributions filter on `/changes`, a login to its in-site
// profile page. Runs as an inline rule so code spans and emails are left untouched.
export function mention(md: MarkdownIt): void {
  md.inline.ruler.before("link", "mention", (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x40 /* @ */) return false;
    if (pos > 0 && MENTION_BLOCK.test(src[pos - 1])) return false;
    const m = MENTION_RE.exec(src.slice(pos + 1));
    if (!m) return false;
    const name = m[0];

    if (!silent) {
      const anon = ANON_RE.test(name);
      const open = state.push("link_open", "a", 1);
      if (anon) {
        open.attrSet("href", `${BASE}/changes?author=${name}`);
        open.attrSet("class", "mention mention-anon");
      } else {
        open.attrSet("href", userHref(name));
        open.attrSet("class", "mention mention-user");
      }
      state.push("text", "", 0).content = `@${name}`;
      state.push("link_close", "a", -1);
    }
    state.pos = pos + 1 + name.length;
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

// Build-time pass: resolve each wikilink for the reading language and flag the
// ones whose target is missing, so links paint with the right href and red state
// on first load instead of flashing until the client manifest arrives. `data-slug`
// stays the raw base so the client can re-resolve against the live manifest.
export function markRedLinksHtml(
  html: string,
  exists: Set<string>,
  lang: string,
): string {
  return html.replace(
    /<a href="[^"]*" class="wikilink" data-slug="([^"]+)">/g,
    (_whole, base) => {
      const { slug, red } = resolveWikiSlug(base, exists, lang);
      const cls = red ? "wikilink is-red" : "wikilink";
      const title = red ? ' title="Page does not exist yet — click to create"' : "";
      return `<a href="${readHref(slug)}" class="${cls}" data-slug="${base}"${title}>`;
    },
  );
}
