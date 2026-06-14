import type MarkdownIt from "markdown-it";

// Wikipedia-style floating images using remark-directive *syntax* on top of
// markdown-it (no engine swap). A leaf directive on its own line:
//
//   ::image[Fleurs de caféier]{src=coffee.jpg align=right width=320}
//
// becomes a floated <figure> with the label as <figcaption>. `align` floats it
// (left/right) or blocks it (center/none); `width` caps it; `upright` is a
// narrower default for portrait images. Like wikitext sizes, width is a *cap*,
// never an upscale — the <img> stays max-width:100%.

const LEAF_RE = /^::image(?:\[([^\]]*)\])?(?:\{([^}]*)\})?\s*$/;
const ATTR_RE = /([.#])([\w-]+)|([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

const FLOAT_WIDTH = 250;
const UPRIGHT_WIDTH = 180;
const MAX_WIDTH = 600;

type Align = "left" | "right" | "center" | "none";

interface Directive {
  src: string;
  alt: string;
  caption: string;
  align: Align;
  width: string | null;
}

function parseWidth(raw: string | undefined, upright: boolean): string | null {
  if (raw) {
    if (/^\d+%$/.test(raw)) return raw;
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return `${Math.min(n, MAX_WIDTH)}px`;
    return null;
  }
  if (upright) return `${UPRIGHT_WIDTH}px`;
  return null;
}

function parseDirective(label: string, attrStr: string): Directive | null {
  const attrs: Record<string, string> = {};
  let upright = false;
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(attrStr); m; m = ATTR_RE.exec(attrStr)) {
    if (m[1]) continue; // .class / #id — unused for now
    const key = m[3];
    const val = m[4] ?? m[5] ?? m[6] ?? "";
    if (key === "upright") upright = true;
    else attrs[key] = val;
  }
  const src = attrs.src?.trim();
  if (!src) return null;
  const align: Align =
    attrs.align === "left" || attrs.align === "center" || attrs.align === "none"
      ? attrs.align
      : "right";
  return {
    src,
    alt: (attrs.alt ?? label).trim(),
    caption: label.trim(),
    align,
    width:
      parseWidth(attrs.width, upright) ??
      (align === "right" || align === "left" ? `${FLOAT_WIDTH}px` : null),
  };
}

export function directiveImage(md: MarkdownIt): void {
  md.block.ruler.before(
    "paragraph",
    "directive_image",
    (state, startLine, _endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const m = LEAF_RE.exec(state.src.slice(start, max));
      if (!m) return false;
      if (silent) return true;

      const dir = parseDirective(m[1] ?? "", m[2] ?? "");
      if (!dir) return false;

      const open = state.push("dimage_figure_open", "figure", 1);
      open.attrSet("class", `figure figure--${dir.align}`);
      if (dir.width) open.attrSet("style", `width:${dir.width}`);

      const img = state.push("dimage_img", "img", 0);
      img.attrSet("src", dir.src);
      img.attrSet("alt", dir.alt);

      if (dir.caption) {
        state.push("dimage_caption_open", "figcaption", 1);
        const inline = state.push("inline", "", 0);
        inline.content = dir.caption;
        inline.map = [startLine, startLine + 1];
        inline.children = [];
        state.push("dimage_caption_close", "figcaption", -1);
      }

      state.push("dimage_figure_close", "figure", -1);
      state.line = startLine + 1;
      return true;
    },
  );

  const esc = md.utils.escapeHtml;
  md.renderer.rules.dimage_figure_open = (tokens, i) => {
    const t = tokens[i];
    const cls = t.attrGet("class") ?? "figure";
    const style = t.attrGet("style");
    return `<figure class="${esc(cls)}"${style ? ` style="${esc(style)}"` : ""}>`;
  };
  md.renderer.rules.dimage_figure_close = () => "</figure>\n";
  md.renderer.rules.dimage_img = (tokens, i) => {
    const t = tokens[i];
    return `<img src="${esc(t.attrGet("src") ?? "")}" alt="${esc(t.attrGet("alt") ?? "")}" loading="lazy">`;
  };
  md.renderer.rules.dimage_caption_open = () => "<figcaption>";
  md.renderer.rules.dimage_caption_close = () => "</figcaption>";
}
