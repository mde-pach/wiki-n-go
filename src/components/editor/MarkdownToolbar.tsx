import { Icons } from "../Icons";

export function MarkdownToolbar(props: {
  wrap: (before: string, after?: string) => void;
  prefixLine: (prefix: string) => void;
}) {
  return (
    <div class="md-toolbar">
      <button
        type="button"
        class="md-btn"
        title="Bold"
        aria-label="Bold"
        onClick={() => props.wrap("**")}
      >
        <Icons.Bold />
      </button>
      <button
        type="button"
        class="md-btn"
        title="Italic"
        aria-label="Italic"
        onClick={() => props.wrap("_")}
      >
        <Icons.Italic />
      </button>
      <span class="md-sep" />
      <button
        type="button"
        class="md-btn"
        title="Heading"
        aria-label="Heading"
        onClick={() => props.prefixLine("## ")}
      >
        <Icons.H2 />
      </button>
      <button
        type="button"
        class="md-btn"
        title="List"
        aria-label="List"
        onClick={() => props.prefixLine("- ")}
      >
        <Icons.List />
      </button>
      <button
        type="button"
        class="md-btn"
        title="Quote"
        aria-label="Quote"
        onClick={() => props.prefixLine("> ")}
      >
        <Icons.Quote />
      </button>
      <span class="md-sep" />
      <button
        type="button"
        class="md-btn"
        title="Wiki link"
        aria-label="Insert wiki link"
        style={{ "font-family": "var(--font-mono)" }}
        onClick={() => props.wrap("[[", "]]")}
      >
        [[ ]]
      </button>
      <button
        type="button"
        class="md-btn"
        title="Code"
        aria-label="Code"
        onClick={() => props.wrap("`")}
      >
        <Icons.Code />
      </button>
    </div>
  );
}
