import { createMemo, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { movePage } from "../lib/move";
import { prettify, readHref, slugifyPath } from "../lib/paths";
import { useSubmit } from "../lib/solid";
import { ErrorNote, PageOp } from "./ui";

export default function MovePage() {
  const from = isServer ? "" : (new URLSearchParams(location.search).get("page") ?? "");
  const [target, setTarget] = createSignal(prettify(from));
  const [summary, setSummary] = createSignal("");
  const [done, setDone] = createSignal<string>();
  const { busy, error, setError, run } = useSubmit();
  const toSlug = createMemo(() => slugifyPath(target()));

  function submit() {
    if (!toSlug()) return setError("Enter a new name.");
    if (toSlug() === from) return setError("That's the current name.");
    run(async (tok) => setDone((await movePage(from, toSlug(), summary(), tok)).to));
  }

  return (
    <PageOp
      cls="move-page"
      title="Move or rename a page"
      sub="Renaming leaves a redirect at the old name, so existing links keep working."
      from={from}
      action="Move/rename"
      done={done()}
      success={(to) => (
        <p class="editor-ok">
          Moved to <a href={readHref(to)}>{prettify(to)}</a>. A redirect was left at{" "}
          <span class="mono">{from}</span>.
        </p>
      )}
    >
      <div class="move-form">
        <label class="field-label">
          Current page
          <input class="input mono" value={from} disabled />
        </label>
        <label class="field-label">
          New name
          <input
            class="input"
            value={target()}
            placeholder="New title or slug"
            onInput={(e) => setTarget(e.currentTarget.value)}
          />
        </label>
        <p class="field-hint">
          New address: <span class="mono">{toSlug() || "…"}</span>
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
            {busy() ? "Moving…" : "Move page"}
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
