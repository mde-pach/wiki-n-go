import { batch, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { config } from "../config";
import { rollbackCommit } from "../lib/admin";
import { type Change, fetchChanges, markPatrolled, RISK_HIGH } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { changesHref, isAnonName, prettify, queryParam, readHref } from "../lib/paths";
import { clientResource, useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote, Status, ViewHead } from "./ui";

const PER_PAGE = 30;

export default function RecentChanges(props: { admin?: boolean }) {
  if (!config.workerUrl) return null;

  const { isMaintainer } = useWhoami();
  const [unreviewedOnly, setUnreviewedOnly] = createSignal(false);
  const [highRiskOnly, setHighRiskOnly] = createSignal(false);
  // `?author=` scopes the feed to one contributor — the target of an @mention
  // link. Filters are server-side now, so they span the whole feed (paged), not
  // just the loaded window.
  const author = queryParam("author") || null;
  const [page, setPage] = createSignal(1);
  const [rows, setRows] = createSignal<Change[]>([]);

  const query = createMemo(() => ({
    limit: PER_PAGE,
    page: page(),
    author: author ?? undefined,
    unreviewed: unreviewedOnly() || undefined,
    highRisk: highRiskOnly() || undefined,
  }));
  const [feed, { refetch }] = clientResource(query, fetchChanges);

  // Page 1 replaces the list; later pages append. Toggling a filter resets to
  // page 1 (resetToFirstPage), so this only ever appends a genuine next page.
  createEffect(() => {
    const d = feed();
    if (!d) return;
    setRows((prev) => (page() === 1 ? d.changes : [...prev, ...d.changes]));
  });

  // A filter toggle changes `query`, so the resource refetches on its own; we
  // batch the page+rows reset with it so it refetches once, on page 1.
  const setUnreviewed = (v: boolean) =>
    batch(() => {
      setUnreviewedOnly(v);
      setRows([]);
      setPage(1);
    });
  const setHighRisk = (v: boolean) =>
    batch(() => {
      setHighRiskOnly(v);
      setRows([]);
      setPage(1);
    });

  // Reload after a mutation, where `query` is unchanged: force a refetch when
  // already on page 1, else let the page reset trigger it.
  function reload() {
    if (page() === 1) {
      setRows([]);
      refetch();
    } else {
      batch(() => {
        setRows([]);
        setPage(1);
      });
    }
  }

  async function patrol(sha: string) {
    setRows((prev) => prev.map((c) => (c.sha === sha ? { ...c, patrolled: true } : c)));
    try {
      await markPatrolled(sha);
    } catch {
      reload();
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
      reload();
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

      <Show when={author}>
        {(a) => (
          <div class="rc-contrib">
            Showing contributions by{" "}
            <span class="rc-author" classList={{ anon: isAnonName(a()) }}>
              {a()}
            </span>
            <a class="rc-clear" href={changesHref}>
              show all changes
            </a>
          </div>
        )}
      </Show>

      <div class="rc-filters">
        <label class="rc-filter">
          <input
            type="checkbox"
            checked={unreviewedOnly()}
            onChange={(e) => setUnreviewed(e.currentTarget.checked)}
          />
          Unreviewed only
        </label>
        <label class="rc-filter">
          <input
            type="checkbox"
            checked={highRiskOnly()}
            onChange={(e) => setHighRisk(e.currentTarget.checked)}
          />
          High-risk only
        </label>
      </div>

      <ErrorNote msg={error()} />

      <Show
        when={rows().length > 0}
        fallback={
          <Show when={feed.loading} fallback={<Status>Nothing to show.</Status>}>
            <Status>Loading changes…</Status>
          </Show>
        }
      >
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
        <Show when={feed()?.hasMore}>
          <button
            type="button"
            class="btn btn-ghost rc-more"
            disabled={feed.loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {feed.loading ? "Loading…" : "Load more"}
          </button>
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
