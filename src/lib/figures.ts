import type MarkdownIt from "markdown-it";

// A paragraph that contains only an image becomes a <figure> with the alt text
// as <figcaption> — Wikipedia-style captioned figures.
export function figures(md: MarkdownIt): void {
  md.core.ruler.push("figures", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const inline = tokens[i + 1];
      if (
        tokens[i].type !== "paragraph_open" ||
        inline?.type !== "inline" ||
        tokens[i + 2]?.type !== "paragraph_close" ||
        inline.children?.length !== 1 ||
        inline.children[0].type !== "image"
      ) {
        continue;
      }
      const alt = inline.children[0].content;
      tokens[i].type = "figure_open";
      tokens[i].tag = "figure";
      tokens[i + 2].type = "figure_close";
      tokens[i + 2].tag = "figure";
      if (alt) {
        const open = new state.Token("figcaption_open", "figcaption", 1);
        const text = new state.Token("text", "", 0);
        text.content = alt;
        const close = new state.Token("figcaption_close", "figcaption", -1);
        inline.children.push(open, text, close);
      }
    }
  });
  md.renderer.rules.figure_open = () => '<figure class="figure">';
  md.renderer.rules.figure_close = () => "</figure>\n";
  md.renderer.rules.figcaption_open = () => "<figcaption>";
  md.renderer.rules.figcaption_close = () => "</figcaption>";
}
