import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type Change, listChanges, markPatrolled } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { useWhoami } from "../lib/solid";
import { Status, ViewHead } from "./ui";

export default function RecentChanges() {
  if (!config.workerUrl) return null;

  const [changes, { mutate, refetch }] = createResource(
    () => (isServer ? undefined : 30),
    listChanges,
  );
  const { isMaintainer } = useWhoami();
  const [unreviewedOnly, setUnreviewedOnly] = createSignal(false);

  const rows = () => {
    const all = changes() ?? [];
    return unreviewedOnly() ? all.filter((c) => !c.patrolled) : all;
  };

  async function patrol(sha: string) {
    mutate((prev) => prev?.map((c) => (c.sha === sha ? { ...c, patrolled: true } : c)));
    try {
      await markPatrolled(sha);
    } catch {
      refetch();
    }
  }

  const net = (c: Change) => c.additions - c.deletions;

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Recent changes"
        sub="Every edit to the wiki, newest first — the post-hoc moderation feed."
      />

      <label class="rc-filter">
        <input
          type="checkbox"
          checked={unreviewedOnly()}
          onChange={(e) => setUnreviewedOnly(e.currentTarget.checked)}
        />
        Unreviewed only
      </label>

      <Show when={changes()} fallback={<Status>Loading changes…</Status>}>
        <Show when={rows().length > 0} fallback={<Status>Nothing to show.</Status>}>
          <ul class="rc-list">
            <For each={rows()}>
              {(c) => (
                <li class={`rc-row${c.patrolled ? " is-reviewed" : ""}`}>
                  <span class="rc-time">{timeAgo(c.date)}</span>
                  <span class="rc-pages">
                    <Show when={c.slugs.length > 0} fallback={<span>—</span>}>
                      <For each={c.slugs}>
                        {(s, i) => (
                          <>
                            {i() > 0 ? ", " : ""}
                            <a href={readHref(s)}>{prettify(s)}</a>
                          </>
                        )}
                      </For>
                    </Show>
                  </span>
                  <span class={`rc-delta ${net(c) >= 0 ? "pos" : "neg"}`}>
                    {net(c) >= 0 ? "+" : "−"}
                    {Math.abs(net(c))}
                  </span>
                  <span class="rc-author" classList={{ anon: c.isAnon }}>
                    {c.author}
                  </span>
                  <span class="rc-summary">
                    {c.message}
                    <For each={c.tags}>{(t) => <span class="rc-tag">{t}</span>}</For>
                  </span>
                  <Show
                    when={!c.patrolled}
                    fallback={<span class="rc-badge reviewed">reviewed</span>}
                  >
                    <Show
                      when={isMaintainer()}
                      fallback={<span class="rc-badge">unreviewed</span>}
                    >
                      <button
                        type="button"
                        class="link-btn rc-patrol"
                        onClick={() => patrol(c.sha)}
                      >
                        mark reviewed
                      </button>
                    </Show>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
