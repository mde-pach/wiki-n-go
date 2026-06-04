import { createSignal, For, onMount, Show } from "solid-js";
import { config } from "../config";
import { getDiff, getHistory, type Revision } from "../lib/history";
import { slugFromLocation } from "../lib/slug";

export default function History(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const [revs, setRevs] = createSignal<Revision[]>([]);
  const [open, setOpen] = createSignal(false);
  const [diff, setDiff] = createSignal<{ title: string; patch: string | null }>();
  const [err, setErr] = createSignal<string>();

  onMount(async () => {
    try {
      setRevs(await getHistory(slug()));
    } catch {
      // a brand-new page has no history yet
    }
  });

  const last = () => revs()[0];

  async function show(base: string | null, head: string, title: string) {
    setErr();
    if (!base) {
      setDiff({ title, patch: null });
      return;
    }
    try {
      setDiff({ title, patch: await getDiff(slug(), base, head) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Show when={last()}>
      <div class="page-meta">
        <span>
          Last edited by <span class="meta-author">{last().author}</span> ·{" "}
          {new Date(last().date).toLocaleDateString()}
        </span>
        <button type="button" class="link-btn" onClick={() => setOpen(!open())}>
          {open() ? "Hide history" : `View history (${revs().length})`}
        </button>
      </div>

      <Show when={open()}>
        <ol class="history">
          <For each={revs()}>
            {(r, i) => (
              <li class="rev">
                <span class="rev-actions">
                  <button
                    type="button"
                    class="link-btn"
                    disabled={i() === 0}
                    onClick={() =>
                      show(r.sha, last().sha, `${shorten(r.sha)} → latest`)
                    }
                  >
                    cur
                  </button>
                  <button
                    type="button"
                    class="link-btn"
                    disabled={!r.parent}
                    onClick={() =>
                      show(
                        r.parent,
                        r.sha,
                        `${shorten(r.parent ?? "")} → ${shorten(r.sha)}`,
                      )
                    }
                  >
                    prev
                  </button>
                </span>
                <a
                  class="rev-when"
                  href={commitUrl(r.sha)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {new Date(r.date).toLocaleString()}
                </a>
                <span class="rev-author">{r.author}</span>
                <span class="rev-msg">{r.message}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <Show when={diff()}>
        <div class="diff">
          <div class="diff-head">{diff()?.title}</div>
          <Show
            when={diff()?.patch}
            fallback={<p class="wiki-status">No change to this page in that range.</p>}
          >
            <Diff patch={diff()?.patch ?? ""} />
          </Show>
        </div>
      </Show>
      <Show when={err()}>
        <p class="editor-err">{err()}</p>
      </Show>
    </Show>
  );
}

function Diff(props: { patch: string }) {
  const lines = () => props.patch.split("\n");
  return (
    <pre class="diff-body">
      <For each={lines()}>
        {(ln) => {
          const cls =
            ln.startsWith("+") && !ln.startsWith("+++")
              ? "add"
              : ln.startsWith("-") && !ln.startsWith("---")
                ? "del"
                : ln.startsWith("@@")
                  ? "hunk"
                  : "";
          return <div class={`diff-line ${cls}`}>{ln || " "}</div>;
        }}
      </For>
    </pre>
  );
}

function shorten(sha: string): string {
  return sha.slice(0, 7);
}

function commitUrl(sha: string): string {
  return `https://github.com/${config.repoOwner}/${config.repoName}/commit/${sha}`;
}
