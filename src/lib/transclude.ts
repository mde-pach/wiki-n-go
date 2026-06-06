import type MarkdownIt from "markdown-it";
import { BASE, slugifyPath } from "./paths";

// `{{slug}}` on its own line transcludes another page's body inline — Wikipedia
// transclusion, the basis for navboxes and shared blocks. It renders a
// placeholder the client fills from the CDN at read time (see
// `expandTransclusions` in `decorate`), so it stays no-rebuild. `{{cite|…}}` is
// the inline citation template, not a transclusion: a `|` or a leading `cite`
// opts out and falls through to that rule.
export function transclusion(md: MarkdownIt): void {
  md.block.ruler.before(
    "paragraph",
    "transclusion",
    (state, startLine, _endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const m = /^\{\{([^{}|]+)\}\}$/.exec(state.src.slice(start, max).trim());
      if (!m) return false;
      const inner = m[1].trim();
      if (/^cite\b/i.test(inner)) return false;
      const slug = slugifyPath(inner);
      if (!slug) return false;
      if (silent) return true;

      const token = state.push("transclusion", "", 0);
      token.meta = { slug };
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    },
  );

  // The inner `<a>` is the no-JS fallback (and is replaced once the client fills
  // the body); slugs are already `[a-z0-9/-]`, but escape defensively.
  md.renderer.rules.transclusion = (tokens, idx) => {
    const safe = md.utils.escapeHtml(tokens[idx].meta.slug);
    return `<div class="transclude" data-src="${safe}"><a href="${BASE}/${safe}">${safe}</a></div>\n`;
  };
}
