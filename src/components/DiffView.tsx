import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import {
  type DLine,
  diffStats,
  type SplitCell,
  type SplitRow,
  splitDiff,
} from "../lib/diff";

// Side-by-side / unified diff card, shared by History and the review queue.
// `aHref`/`bHref`/`permalink` are optional; callers that omit them (e.g. the
// review queue) render exactly as before. Collapse markers carrying `hidden`
// lines (from `diffLines`) expand in place; git's own `@@` hunks have none.
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

  const [expanded, setExpanded] = createSignal(new Set<string>());
  const isExpanded = (h: DLine[]) => expanded().has(keyOf(h));
  const toggle = (h: DLine[]) => {
    const k = keyOf(h);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

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
                  <Show when={l.hidden} fallback={<UnifiedLine l={l} />}>
                    {(h) => (
                      <>
                        <button
                          type="button"
                          class="diff-line dl-expand"
                          onClick={() => toggle(h())}
                        >
                          <span class="dl-num" />
                          <span class="dl-sign">{isExpanded(h()) ? "−" : "+"}</span>
                          <span class="dl-text">{expandLabel(l, isExpanded(h()))}</span>
                        </button>
                        <Show when={isExpanded(h())}>
                          <For each={h()}>{(hl) => <UnifiedLine l={hl} />}</For>
                        </Show>
                      </>
                    )}
                  </Show>
                )}
              </For>
            </div>
          }
        >
          <div class="diff-split">
            <For each={rows()}>
              {(row) => (
                <Show when={row.cls === "hunk"} fallback={<SplitDataRow row={row} />}>
                  <Show
                    when={row.hidden}
                    fallback={<div class="ds-hunk">{row.text}</div>}
                  >
                    {(h) => (
                      <>
                        <button
                          type="button"
                          class="ds-hunk ds-expand"
                          onClick={() => toggle(h())}
                        >
                          {expandLabel(row, isExpanded(h()))}
                        </button>
                        <Show when={isExpanded(h())}>
                          <For each={splitDiff(h())}>
                            {(r) => <SplitDataRow row={r} />}
                          </For>
                        </Show>
                      </>
                    )}
                  </Show>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={props.permalink}>{(href) => <PermalinkFoot href={href()} />}</Show>
    </div>
  );
}

function keyOf(hidden: DLine[]): string {
  const first = hidden[0];
  return first ? first.nnum || first.onum || first.text : "";
}

function expandLabel(
  marker: { text?: string; hidden?: DLine[] },
  open: boolean,
): string {
  const n = marker.hidden?.length ?? 0;
  if (open) return `⋯ hide ${n} unchanged line${n === 1 ? "" : "s"} ⋯`;
  return marker.text ?? "";
}

function UnifiedLine(props: { l: DLine }) {
  return (
    <div class={`diff-line ${props.l.cls}`}>
      <span class="dl-num">{props.l.num}</span>
      <span class="dl-sign">{props.l.sign}</span>
      <span class="dl-text">{props.l.text}</span>
    </div>
  );
}

function SplitDataRow(props: { row: SplitRow }) {
  return (
    <div class={`ds-row ${props.row.cls}`}>
      <span class="ds-num">{props.row.left?.num}</span>
      <span class={`ds-cell ds-left${props.row.left ? "" : " is-empty"}`}>
        <Segs cell={props.row.left} side="del-mark" />
      </span>
      <span class="ds-num">{props.row.right?.num}</span>
      <span class={`ds-cell ds-right${props.row.right ? "" : " is-empty"}`}>
        <Segs cell={props.row.right} side="ins" />
      </span>
    </div>
  );
}

function PermalinkFoot(props: { href: string }) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        new URL(props.href, window.location.href).href,
      );
      setCopied(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context / denied) — leave the link.
    }
  }
  return (
    <div class="diff-foot">
      <span class="permalink-box">
        <span>Permalink</span>
        <a href={props.href}>view this page at the new revision</a>
        <button type="button" class="pl-copy" onClick={copy}>
          {copied() ? "Copied ✓" : "Copy link"}
        </button>
      </span>
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
