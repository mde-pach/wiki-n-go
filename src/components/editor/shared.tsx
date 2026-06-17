import { type JSX, Show } from "solid-js";
import type { Progress, WhoAmI } from "../../lib/api";
import type { DLine } from "../../lib/diff";
import DiffView from "../DiffView";
import { ConfirmDialog } from "./ConfirmDialog";

// Markdown-toolbar text ops over a textarea, shared by the full-page and focused
// editors. `get`/`set` point at whichever signal backs the box (body vs section
// slice); `el` returns the live textarea so selection is read at call time.
export function useTextareaTools(
  el: () => HTMLTextAreaElement | undefined,
  get: () => string,
  set: (v: string) => void,
) {
  function wrap(before: string, after = before) {
    const ta = el();
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = get();
    set(v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e));
    ta.focus();
    queueMicrotask(() => {
      if (ta) ta.selectionStart = ta.selectionEnd = e + before.length + after.length;
    });
  }
  function prefixLine(prefix: string) {
    const ta = el();
    if (!ta) return;
    const s = ta.selectionStart;
    const v = get();
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    set(v.slice(0, lineStart) + prefix + v.slice(lineStart));
    ta.focus();
  }
  return { wrap, prefixLine };
}

export function AttributionRow(props: { who: WhoAmI | undefined }) {
  return (
    <div class="attribution-row">
      Signed as{" "}
      <span class="pseudonym">{props.who?.author ?? "anon · your IP, hashed"}</span>
      <Show when={props.who}>
        {(w) => <span class="tier-badge"> · {w().tier}</span>}
      </Show>
    </div>
  );
}

// The live publish-progress bar; renders nothing until a publish is in flight.
export function PublishProgress(props: {
  busy: boolean;
  progress: Progress | undefined;
}) {
  return (
    <Show when={props.busy && props.progress}>
      {(p) => (
        <div class="publish-progress" role="status" aria-live="polite">
          <div class="publish-progress-head">
            <span>{p().label}…</span>
            <span class="mono">{Math.round(p().progress * 100)}%</span>
          </div>
          <div class="publish-progress-track">
            <div
              class="publish-progress-fill"
              style={{ width: `${Math.max(4, p().progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </Show>
  );
}

// The submit-confirmation dialog (summary + size delta + diff preview), shared by
// both editors. `aLabel` differs only for a brand-new page ("(new page)").
export function SubmitConfirm(props: {
  summary: string;
  fromLen: number;
  toLen: number;
  lines: DLine[] | null;
  aLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const delta = () => props.toLen - props.fromLen;
  return (
    <ConfirmDialog
      title="Submit this change"
      subtitle="Depending on your trust level and the page, this either publishes immediately or is submitted for review."
      wide
      body={
        <>
          <p>
            Summary: <strong>{props.summary || "(none)"}</strong>
          </p>
          <p>
            Size:{" "}
            <span class="mono">
              {props.fromLen} → {props.toLen} chars ({delta() >= 0 ? "+" : ""}
              {delta()})
            </span>
          </p>
          <p class="field-label" style={{ "margin-bottom": "0.4rem" }}>
            Changes
          </p>
          <DiffView
            lines={props.lines}
            a={props.aLabel}
            b="your edit"
            initialMode="unified"
          />
        </>
      }
      confirmLabel={props.busy ? "Submitting…" : "Submit change"}
      cancelLabel="Back"
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}
