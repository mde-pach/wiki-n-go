import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { rollbackCommit } from "../lib/admin";
import { type Change, listChanges, markPatrolled, RISK_HIGH } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function RecentChanges(props: { admin?: boolean }) {
  if (!config.workerUrl) return null;

  const [changes, { mutate, refetch }] = createResource(
    () => (isServer ? undefined : 30),
    listChanges,
  );
  const { isMaintainer } = useWhoami();
  const [unreviewedOnly, setUnreviewedOnly] = createSignal(false);
  const [highRiskOnly, setHighRiskOnly] = createSignal(false);

  const rows = () => {
    let all = changes() ?? [];
    if (unreviewedOnly()) all = all.filter((c) => !c.patrolled);
    if (highRiskOnly()) all = all.filter((c) => c.risk >= RISK_HIGH);
    return all;
  };

  async function patrol(sha: string) {
    mutate((prev) => prev?.map((c) => (c.sha === sha ? { ...c, patrolled: true } : c)));
    try {
      await markPatrolled(sha);
    } catch {
      refetch();
    }
  }

  const [confirm, setConfirm] = createSignal<Change>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function doRollback() {
    const c = confirm();
    if (!c) return;
    setBusy(true);
    setError();
    try {
      await rollbackCommit(c.sha);
      setConfirm(undefined);
      refetch();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const net = (c: Change) => c.additions - c.deletions;
  const canRollback = (c: Change) =>
    props.admin && isMaintainer() && c.slugs.length > 0;

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Recent changes"
        sub="Every edit to the wiki, newest first — the post-hoc moderation feed."
      />

      <div class="rc-filters">
        <label class="rc-filter">
          <input
            type="checkbox"
            checked={unreviewedOnly()}
            onChange={(e) => setUnreviewedOnly(e.currentTarget.checked)}
          />
          Unreviewed only
        </label>
        <label class="rc-filter">
          <input
            type="checkbox"
            checked={highRiskOnly()}
            onChange={(e) => setHighRiskOnly(e.currentTarget.checked)}
          />
          High-risk only
        </label>
      </div>

      <ErrorNote msg={error()} />

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
                    <Show when={c.risk >= RISK_HIGH}>
                      <span class="rc-tag risk" title={`revert-risk ${c.risk}`}>
                        high risk
                      </span>
                    </Show>
                  </span>
                  <span class="rc-actions">
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
                    <Show when={canRollback(c)}>
                      <button
                        type="button"
                        class="link-btn rc-rollback"
                        onClick={() => setConfirm(c)}
                      >
                        roll back
                      </button>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={confirm()}>
        {(c) => (
          <ConfirmDialog
            title="Roll back revision"
            subtitle={<>Restores the affected pages to their state before this edit.</>}
            body={
              <p>
                Roll back{" "}
                <strong>
                  {c()
                    .slugs.map((s) => prettify(s))
                    .join(", ")}
                </strong>{" "}
                to before <code>{c().sha.slice(0, 7)}</code>? Any later changes to these
                pages will be replaced. The rollback is itself a revision, so it can be
                undone.
              </p>
            }
            confirmLabel={busy() ? "Rolling back…" : "Roll back"}
            cancelLabel="Cancel"
            busy={busy()}
            onConfirm={doRollback}
            onCancel={() => setConfirm(undefined)}
          />
        )}
      </Show>
    </main>
  );
}
