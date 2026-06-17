import { createMemo, createSignal, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../../config";
import { type EditResult, type Progress, submitEdit } from "../../lib/api";
import { diffLines } from "../../lib/diff";
import { type SectionSpan, spliceSection } from "../../lib/editor-section";
import { renderMarkdown } from "../../lib/markdown";
import { viewHref } from "../../lib/paths";
import { useSubmit, useWhoami } from "../../lib/solid";
import { ErrorNote } from "../ui";
import { MarkdownToolbar } from "./MarkdownToolbar";
import {
  AttributionRow,
  PublishProgress,
  SubmitConfirm,
  useTextareaTools,
} from "./shared";

// The generic in-page focused-edit surface: edit one slice of a document — a
// section body today; a header card or infobox row tomorrow — without leaving
// the read page. On save it splices the edited slice back into the source,
// reconstructs the *whole* document, and submits it through the exact same
// pipeline as the full-page editor (`submitEdit`). There is no second write
// path: trust/proof-of-work/diff-preview/deterministic-branch publish are
// all the Worker's, reached identically.
export default function FocusedEditor(props: {
  slug: string;
  // The full current document (frontmatter + body) — the diff/conflict baseline.
  original: string;
  // The text the span indexes into (the body, sans frontmatter).
  source: string;
  span: SectionSpan;
  // Rebuild the full document to submit from the edited source.
  reconstruct: (newSource: string) => string;
  onClose: () => void;
  // Fires after a successful publish with the full document just submitted, so
  // the host can refresh the read view from the published bytes without a fetch.
  onPublished?: (result: EditResult, content: string) => void;
}) {
  if (!config.workerUrl) return null;

  const initial = props.source.slice(props.span.start, props.span.end);
  const [slice, setSlice] = createSignal(initial);
  const [summary, setSummary] = createSignal(`Edit ${props.span.heading} section`);
  const [result, setResult] = createSignal<EditResult>();
  const [progress, setProgress] = createSignal<Progress>();
  const [modal, setModal] = createSignal(false);
  const { who } = useWhoami();
  const { busy, error, setError, run } = useSubmit();
  let ta: HTMLTextAreaElement | undefined;

  const content = () =>
    props.reconstruct(spliceSection(props.source, props.span, slice()));
  const preview = () =>
    isServer ? "" : renderMarkdown(slice() || "_Nothing to preview yet._");

  const previewDiff = createMemo(() => {
    if (!modal()) return null;
    const lines = diffLines(props.original, content());
    return lines.length ? lines : null;
  });

  const { wrap, prefixLine } = useTextareaTools(() => ta, slice, setSlice);

  function confirmSubmit() {
    setModal(false);
    setProgress({ progress: 0, label: "Starting" });
    run(async (tok) => {
      const doc = content();
      const r = await submitEdit(props.slug, doc, tok, summary(), setProgress);
      setResult(r);
      props.onPublished?.(r, doc);
    });
  }

  const rows = Math.min(26, Math.max(8, initial.split("\n").length + 1));

  return (
    <div class="focused-edit panel">
      <div class="focused-edit-head">
        <h3>
          Editing section <span class="fe-heading">{props.span.heading}</span>
        </h3>
        <a class="fe-whole" href={viewHref("edit", props.slug)}>
          Edit whole page →
        </a>
      </div>

      <Show
        when={!result()}
        fallback={<FocusedResult result={result()} onClose={props.onClose} />}
      >
        <div class="editor-pane">
          <div class="pane-bar">
            <span class="pane-name">Markdown</span>
            <MarkdownToolbar wrap={wrap} prefixLine={prefixLine} />
          </div>
          <textarea
            ref={ta}
            class="editor-textarea"
            rows={rows}
            // `prop:value` so the seeded section text survives SSR/hydration —
            // see the note in Editor.tsx. (Client-created today, but kept robust.)
            prop:value={slice()}
            placeholder="Write Markdown…"
            onInput={(e) => setSlice(e.currentTarget.value)}
          />
        </div>

        <div class="fe-preview">
          <span class="fe-preview-label">Live preview</span>
          <div class="preview-scroll prose" innerHTML={preview()} />
        </div>

        <div class="fe-publish">
          <input
            class="input"
            value={summary()}
            placeholder="Briefly describe your change"
            aria-label="Edit summary"
            onInput={(e) => setSummary(e.currentTarget.value)}
          />
          <AttributionRow who={who()} />
          <div class="editor-actions">
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy() || !slice().trim()}
              onClick={() => {
                setError(undefined);
                setModal(true);
              }}
            >
              Publish…
            </button>
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
          </div>
          <PublishProgress busy={busy()} progress={progress()} />
          <ErrorNote msg={error()} />
        </div>
      </Show>

      <Show when={modal()}>
        <SubmitConfirm
          summary={summary()}
          fromLen={props.original.length}
          toLen={content().length}
          lines={previewDiff()}
          aLabel="current"
          busy={busy()}
          onConfirm={confirmSubmit}
          onCancel={() => setModal(false)}
        />
      </Show>
    </div>
  );
}

function FocusedResult(props: { result: EditResult | undefined; onClose: () => void }) {
  return (
    <Show when={props.result}>
      {(r) => (
        <div class="fe-publish">
          <Show
            when={!r().autoReverted}
            fallback={
              <p class="editor-ok editor-reverted" role="alert">
                This edit was automatically reverted as likely vandalism. If that's
                wrong, re-edit the page or raise it on the talk page — a maintainer can
                restore it.
              </p>
            }
          >
            <p class="editor-ok">
              <Show
                when={r().live}
                fallback={
                  <>
                    Submitted for review —{" "}
                    <a href={r().prUrl} target="_blank" rel="noreferrer">
                      track its status
                    </a>
                    .
                  </>
                }
              >
                Published live.
              </Show>
            </p>
          </Show>
          <div class="editor-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
