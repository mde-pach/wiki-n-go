import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { parseDiff } from "../lib/diff";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { getPendingDiff, listPending, reviewPr } from "../lib/review";
import { useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import DiffView from "./DiffView";
import { Icons } from "./Icons";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function ReviewQueue() {
  if (!config.workerUrl) return null;

  const [pending, { mutate, refetch }] = createResource(
    () => (isServer ? undefined : true),
    listPending,
  );
  const { isMaintainer } = useWhoami();

  const [openNum, setOpenNum] = createSignal<number>();
  const [diff] = createResource(openNum, getPendingDiff);
  const lines = () => {
    const p = diff();
    return p ? parseDiff(p) : null;
  };

  const [busy, setBusy] = createSignal<number>();
  const [error, setError] = createSignal<string>();

  const toggle = (n: number) => setOpenNum(openNum() === n ? undefined : n);

  async function act(number: number, action: "merge" | "close") {
    setBusy(number);
    setError();
    try {
      await reviewPr(number, action);
      mutate((prev) => prev?.filter((p) => p.number !== number));
      if (openNum() === number) setOpenNum(undefined);
    } catch (e) {
      setError(errMessage(e));
      refetch();
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main id="main" class="view-wrap">
      <ViewHead title="Pending review">
        <p>
          Anonymous edits awaiting a maintainer.{" "}
          <Show when={!isMaintainer()}>Sign-off is limited to maintainers.</Show>
        </p>
      </ViewHead>

      <ErrorNote msg={error()} />

      <Show when={pending()} fallback={<Status>Loading pending edits…</Status>}>
        <Show
          when={(pending()?.length ?? 0) > 0}
          fallback={<Status>Nothing pending — all caught up.</Status>}
        >
          <ul class="rv-list">
            <For each={pending()}>
              {(p) => (
                <li class="rv-item">
                  <div class="rv-row">
                    <a class="rv-page" href={readHref(p.slug)}>
                      {prettify(p.slug)}
                    </a>
                    <button
                      type="button"
                      class="rv-summary"
                      aria-expanded={openNum() === p.number}
                      onClick={() => toggle(p.number)}
                    >
                      <Icons.Chevron
                        class="rv-caret"
                        style={{
                          transform:
                            openNum() === p.number ? "rotate(0)" : "rotate(-90deg)",
                        }}
                      />
                      <span class="rv-title">{p.title}</span>
                      <span
                        class={`rv-delta ${p.additions - p.deletions >= 0 ? "pos" : "neg"}`}
                      >
                        +{p.additions} −{p.deletions}
                      </span>
                      <span class="rv-author">{p.author}</span>
                      <span class="rv-time">{timeAgo(p.createdAt)}</span>
                    </button>
                    <Show when={isMaintainer()}>
                      <div class="rv-actions">
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          disabled={busy() === p.number}
                          onClick={() => act(p.number, "merge")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          disabled={busy() === p.number}
                          onClick={() => act(p.number, "close")}
                        >
                          Reject
                        </button>
                      </div>
                    </Show>
                  </div>
                  <Show when={openNum() === p.number}>
                    <div class="rv-diff">
                      <Show
                        when={!diff.loading}
                        fallback={<Status>Loading diff…</Status>}
                      >
                        <DiffView lines={lines()} a="current" b="proposed" />
                      </Show>
                    </div>
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
