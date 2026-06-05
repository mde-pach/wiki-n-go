import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import {
  type DLine,
  diffStats,
  parseDiff,
  type SplitCell,
  type SplitRow,
  splitDiff,
} from "../lib/diff";
import { getDiff, getHistory, type Revision } from "../lib/history";
import { slugFromLocation } from "../lib/slug";
import { errMessage } from "../lib/util";

export default function History(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const [revs] = createResource(() => (isServer ? undefined : slug()), getHistory);
  const [diff, setDiff] = createSignal<{
    a: string;
    b: string;
    lines: DLine[] | null;
  }>();
  const [err, setErr] = createSignal<string>();
  const [mode, setMode] = createSignal<"split" | "unified">("split");
  const latest = () => revs()?.[0]?.sha;

  const lines = () => diff()?.lines ?? null;
  const rows = createMemo<SplitRow[] | null>(() => {
    const l = lines();
    return l ? splitDiff(l) : null;
  });
  const stats = () => {
    const l = lines();
    return l ? diffStats(l) : null;
  };

  async function show(base: string | null, head: string) {
    setErr();
    if (!base) {
      setDiff({ a: "(none)", b: short(head), lines: null });
      return;
    }
    try {
      const patch = await getDiff(slug(), base, head);
      setDiff({
        a: short(base),
        b: short(head),
        lines: patch ? parseDiff(patch) : null,
      });
    } catch (e) {
      setErr(errMessage(e));
    }
  }

  return (
    <div>
      <div class="view-head">
        <h2>Revision history</h2>
        <p>
          Every edit is a commit. Compare any revision with the previous one or the
          current page.
        </p>
      </div>

      <Show when={revs()} fallback={<RevSkeleton />}>
        <ol class="rev-list">
          <For each={revs()}>
            {(r: Revision, i) => (
              <li class={`rev-row${i() === 0 ? " is-current" : ""}`}>
                <div class="rev-actions">
                  <button
                    type="button"
                    class="link-btn"
                    disabled={i() === 0}
                    onClick={() => show(r.sha, latest() ?? r.sha)}
                  >
                    cur
                  </button>
                  <button
                    type="button"
                    class="link-btn"
                    disabled={!r.parent}
                    onClick={() => show(r.parent, r.sha)}
                  >
                    prev
                  </button>
                </div>
                <div class="rev-main">
                  <div class="rev-line1">
                    <a
                      class="rev-time"
                      href={commitUrl(r.sha)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {new Date(r.date).toLocaleString()}
                    </a>
                    <span
                      class={`rev-author${r.author.startsWith("anon-") ? " is-anon" : ""}`}
                    >
                      {r.author.startsWith("anon-") ? (
                        <span class="mono">{r.author}</span>
                      ) : (
                        r.author
                      )}
                    </span>
                    <Show when={i() === 0}>
                      <span class="rev-tag tag-current">current</span>
                    </Show>
                  </div>
                  <div class="rev-summary">{r.message}</div>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <Show when={diff()}>
        <div class="diff-card">
          <div class="diff-head">
            <div class="dh-side">
              <span class="dh-rev">{diff()?.a}</span>
              <span class="dh-meta">old</span>
            </div>
            <span class="dh-arrow">→</span>
            <div class="dh-side">
              <span class="dh-rev">{diff()?.b}</span>
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
            when={diff()?.lines}
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
                  <For each={diff()?.lines}>
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
        </div>
      </Show>
      <Show when={err()}>
        <p class="editor-err">{err()}</p>
      </Show>
    </div>
  );
}

function RevSkeleton() {
  return (
    <ol class="rev-list">
      <For each={[0, 1, 2, 3, 4]}>
        {() => (
          <li class="rev-row">
            <div class="rev-actions" />
            <div class="rev-main">
              <div
                class="sk-bar skeleton"
                style={{ width: "55%", height: "0.95rem", "margin-bottom": "0.4rem" }}
              />
              <div class="sk-bar skeleton" style={{ width: "82%", height: "0.8rem" }} />
            </div>
          </li>
        )}
      </For>
    </ol>
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

function short(sha: string): string {
  return sha.slice(0, 7);
}
function commitUrl(sha: string): string {
  return `https://github.com/${config.repoOwner}/${config.repoName}/commit/${sha}`;
}
