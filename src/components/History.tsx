import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type DLine, parseDiff } from "../lib/diff";
import { getDiff, getHistory, type Revision } from "../lib/history";
import { slugFromLocation } from "../lib/slug";
import { errMessage } from "../lib/util";
import DiffView from "./DiffView";

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
  const latest = () => revs()?.[0]?.sha;

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
        {(d) => <DiffView lines={d().lines} a={d().a} b={d().b} />}
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

function short(sha: string): string {
  return sha.slice(0, 7);
}
function commitUrl(sha: string): string {
  return `https://github.com/${config.repoOwner}/${config.repoName}/commit/${sha}`;
}
