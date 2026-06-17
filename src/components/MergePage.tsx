import { createMemo, createSignal } from "solid-js";
import { fetchMarkdown } from "../lib/content";
import { composeMerge, mergePages } from "../lib/lifecycle";
import { prettify, queryParam, readHref, slugifyPath } from "../lib/paths";
import { useSubmit } from "../lib/solid";
import { ErrorNote, PageOp } from "./ui";

export default function MergePage() {
  const from = queryParam("page");
  const [target, setTarget] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [done, setDone] = createSignal<string>();
  const { busy, error, setError, run } = useSubmit();
  const toSlug = createMemo(() => slugifyPath(target()));

  function submit() {
    if (!toSlug()) return setError("Enter the page to merge into.");
    if (toSlug() === from) return setError("A page can't be merged into itself.");
    run(async (tok) => {
      const [fromRaw, toRaw] = await Promise.all([
        fetchMarkdown(from),
        fetchMarkdown(toSlug()),
      ]);
      const content = composeMerge(from, fromRaw, toRaw);
      const res = await mergePages(
        from,
        toSlug(),
        content,
        summary() || `Merge ${from} into ${toSlug()}`,
        tok,
      );
      setDone(res.to);
    });
  }

  return (
    <PageOp
      cls="merge-page"
      title="Merge a page"
      sub="Fold this page's content into another. The other page keeps both, and this one becomes a redirect so existing links keep working."
      from={from}
      action="Merge"
      done={done()}
      success={(to) => (
        <p class="editor-ok">
          Merged into <a href={readHref(to)}>{prettify(to)}</a>. A redirect was left at{" "}
          <span class="mono">{from}</span>.
        </p>
      )}
    >
      <div class="merge-form">
        <label class="field-label">
          Merge this page
          <input class="input mono" value={from} disabled />
        </label>
        <label class="field-label">
          Into
          <input
            class="input"
            value={target()}
            placeholder="Target page title or slug"
            onInput={(e) => setTarget(e.currentTarget.value)}
          />
        </label>
        <p class="field-hint">
          Target: <span class="mono">{toSlug() || "…"}</span>
        </p>
        <label class="field-label">
          Reason (optional)
          <input
            class="input"
            value={summary()}
            onInput={(e) => setSummary(e.currentTarget.value)}
          />
        </label>
        <div class="editor-actions">
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy()}
            onClick={submit}
          >
            {busy() ? "Merging…" : "Merge page"}
          </button>
          <a class="btn btn-ghost" href={readHref(from)}>
            Cancel
          </a>
        </div>
        <ErrorNote msg={error()} />
      </div>
    </PageOp>
  );
}
