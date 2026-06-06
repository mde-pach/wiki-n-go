import { createMemo, createSignal, For, Show } from "solid-js";
import {
  type DLine,
  diffStats,
  type SplitCell,
  type SplitRow,
  splitDiff,
} from "../lib/diff";

// Side-by-side / unified diff card, shared by History and the review queue.
// `aHref`/`bHref`/`permalink` are optional; callers that omit them (e.g. the
// review queue) render exactly as before.
export default function DiffView(props: {
  lines: DLine[] | null;
  a: string;
  b: string;
  aHref?: string;
  bHref?: string;
  permalink?: string;
  initialMode?: "split" | "unified";
}) {
  const [mode, setMode] = createSignal<"split" | "unified">(
    props.initialMode ?? "split",
  );
  const rows = createMemo<SplitRow[] | null>(() =>
    props.lines ? splitDiff(props.lines) : null,
  );
  const stats = () => (props.lines ? diffStats(props.lines) : null);

  return (
    <div class="diff-card">
      <div class="diff-head">
        <div class="dh-side">
          <RevLabel rev={props.a} href={props.aHref} />
          <span class="dh-meta">old</span>
        </div>
        <span class="dh-arrow">→</span>
        <div class="dh-side">
          <RevLabel rev={props.b} href={props.bHref} />
          <span class="dh-meta">new</span>
        </div>
        <Show when={stats()}>
          {(s) => (
            <span class="diff-stats">
              <span class="ds-add">+{s().add}</span>
              <span class="ds-del">−{s().del}</span>
            </span>
          )}
        </Show>
        <div class="diff-legend">
          <span class="lg">
            <span class="sw add" />
            Added
          </span>
          <span class="lg">
            <span class="sw del" />
            Removed
          </span>
        </div>
        <div class="diff-modes" role="group" aria-label="Diff layout">
          <button
            type="button"
            class={`dm-btn${mode() === "split" ? " is-active" : ""}`}
            aria-pressed={mode() === "split"}
            onClick={() => setMode("split")}
          >
            Split
          </button>
          <button
            type="button"
            class={`dm-btn${mode() === "unified" ? " is-active" : ""}`}
            aria-pressed={mode() === "unified"}
            onClick={() => setMode("unified")}
          >
            Unified
          </button>
        </div>
      </div>
      <Show
        when={props.lines}
        fallback={
          <p class="wiki-status" style={{ padding: "1rem" }}>
            No change to this page in that range.
          </p>
        }
      >
        <Show
          when={mode() === "split"}
          fallback={
            <div class="diff-body">
              <For each={props.lines}>
                {(l) => (
                  <div class={`diff-line ${l.cls}`}>
                    <span class="dl-num">{l.num}</span>
                    <span class="dl-sign">{l.sign}</span>
                    <span class="dl-text">{l.text}</span>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <div class="diff-split">
            <For each={rows()}>
              {(row) => (
                <Show
                  when={row.cls !== "hunk"}
                  fallback={<div class="ds-hunk">{row.text}</div>}
                >
                  <div class={`ds-row ${row.cls}`}>
                    <span class="ds-num">{row.left?.num}</span>
                    <span class={`ds-cell ds-left${row.left ? "" : " is-empty"}`}>
                      <Segs cell={row.left} side="del-mark" />
                    </span>
                    <span class="ds-num">{row.right?.num}</span>
                    <span class={`ds-cell ds-right${row.right ? "" : " is-empty"}`}>
                      <Segs cell={row.right} side="ins" />
                    </span>
                  </div>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={props.permalink}>
        {(href) => (
          <div class="diff-foot">
            <span class="permalink-box">
              <span>Permalink</span>
              <a href={href()}>view this page at the new revision</a>
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}

function RevLabel(props: { rev: string; href?: string }) {
  return (
    <Show when={props.href} fallback={<span class="dh-rev">{props.rev}</span>}>
      {(href) => (
        <a class="dh-rev" href={href()} target="_blank" rel="noreferrer">
          {props.rev}
        </a>
      )}
    </Show>
  );
}

function Segs(props: { cell: SplitCell | null; side: "ins" | "del-mark" }) {
  return (
    <Show when={props.cell}>
      {(c) => (
        <For each={c().segs}>
          {(s) => (s.changed ? <span class={props.side}>{s.t}</span> : s.t)}
        </For>
      )}
    </Show>
  );
}
