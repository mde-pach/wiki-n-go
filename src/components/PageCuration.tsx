import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { deletePage, rollbackCommit, tagChange } from "../lib/admin";
import { type Change, listChanges, markPatrolled, RISK_HIGH } from "../lib/changes";
import {
  type Curation,
  curationFromChange,
  enrichCuration,
  loadPatrolStatus,
} from "../lib/curation";
import { changesHref, prettify, userHref, viewHref } from "../lib/paths";
import { useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote } from "./ui";

// Common maintenance/review tags a reviewer applies in one click; the Worker
// also accepts any other token matching TAG_RE.
const TAG_PRESETS = ["vandalism", "spam", "notability", "sources", "cleanup", "npov"];

// Reviewer overlay for triaging a new/unpatrolled page in one place: approve
// (patrol), tag, message the author, jump to their contributions, propose
// delete, roll back — all over the existing Worker endpoints. Maintainer-gated.
// Pass `change` when the caller already has the row (New-pages queue) to skip
// the fetch; omit it on a read view and the toolbar resolves its own state.
export default function PageCuration(props: {
  slug: string;
  change?: Change;
  onChanged?: () => void;
  // `bar` styles it as a standalone toolbar card (read view); the default inline
  // form sits in a list row (New-pages queue).
  bar?: boolean;
}) {
  if (!config.workerUrl) return null;

  const { isMaintainer } = useWhoami();
  const cls = () => `curation${props.bar ? " cur-bar" : ""}`;

  // Drop the CurationBoot pre-paint shell; this island now owns the bar.
  onMount(() => document.getElementById("cur-pre")?.remove());

  // The fast patrol-status drives the bar so it's actionable after one round-trip.
  const live = () => !isServer && isMaintainer() && !props.change;
  const [status, { refetch: refetchStatus }] = createResource(
    () => (live() ? props.slug : undefined),
    loadPatrolStatus,
  );
  // The recent-changes feed is slower and only enriches the bar (author/risk/
  // tags), so it goes through a plain signal, not a resource: reading a pending
  // resource suspends the whole island (Solid waits on every read resource), so
  // the bar would otherwise sit behind the slow feed. A signal never suspends.
  const [recent, setRecent] = createSignal<Change[]>();
  let recentLoaded = false;
  const loadRecent = () => {
    recentLoaded = true;
    listChanges()
      .then(setRecent)
      .catch(() => {});
  };
  createEffect(() => {
    if (live() && !recentLoaded) loadRecent();
  });
  const refetch = () => {
    refetchStatus();
    recentLoaded = false;
    loadRecent();
  };
  const base = (): Curation | undefined => {
    if (props.change) return curationFromChange(props.slug, props.change);
    const s = status();
    if (!s) return undefined;
    const changes = recent();
    return changes ? enrichCuration(s, changes) : s;
  };

  const [patrolledOpt, setPatrolledOpt] = createSignal<boolean>();
  const [tagsOpt, setTagsOpt] = createSignal<string[]>();
  const [tagOpen, setTagOpen] = createSignal(false);
  const [deleted, setDeleted] = createSignal(false);
  const cur = createMemo(() => {
    const b = base();
    if (!b) return undefined;
    const opt = patrolledOpt();
    return opt === undefined ? b : { ...b, patrolled: opt };
  });
  const tags = () => tagsOpt() ?? cur()?.tags ?? [];

  const [confirm, setConfirm] = createSignal<"delete" | "rollback">();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function approve() {
    const c = cur();
    if (!c?.sha) return;
    setError();
    setPatrolledOpt(true);
    try {
      await markPatrolled(c.sha);
      props.onChanged?.();
    } catch (e) {
      setPatrolledOpt(undefined);
      setError(errMessage(e));
    }
  }

  async function applyTag(label: string) {
    const c = cur();
    setTagOpen(false);
    if (!c?.sha || tags().includes(label)) return;
    setError();
    const prev = tags();
    setTagsOpt([...prev, label]);
    try {
      await tagChange(c.sha, label);
      props.onChanged?.();
    } catch (e) {
      setTagsOpt(prev);
      setError(errMessage(e));
    }
  }

  async function runConfirmed() {
    const c = cur();
    const what = confirm();
    if (!c || !what) return;
    setBusy(true);
    setError();
    try {
      if (what === "delete") {
        await deletePage(c.slug);
        setDeleted(true);
      } else {
        if (!c.sha) throw new Error("No revision to roll back.");
        await rollbackCommit(c.sha);
      }
      setConfirm(undefined);
      props.onChanged?.();
      refetch();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const contribHref = (c: Curation) =>
    c.isAnon
      ? `${changesHref}?author=${encodeURIComponent(c.author ?? "")}`
      : userHref(c.author ?? "");

  return (
    <Show when={isMaintainer()}>
      <Show
        when={!deleted()}
        fallback={
          <div class={cls()}>
            <span class="cur-done">
              Deleted — removed from the wiki (kept in git history).
            </span>
          </div>
        }
      >
        <div class={cls()} role="group" aria-label="Page curation">
          <span class="cur-label">Curation</span>
          <Show
            when={cur()}
            fallback={
              <span class="cur-skeleton" aria-hidden="true">
                <span class="skeleton cur-sk-chip" />
                <span class="skeleton cur-sk-chip" />
                <span class="skeleton cur-sk-chip" />
              </span>
            }
          >
            {(c) => (
              <>
                <Show
                  when={c().patrolled}
                  fallback={
                    <button
                      type="button"
                      class="link-btn cur-approve"
                      onClick={approve}
                    >
                      approve
                    </button>
                  }
                >
                  <span class="rc-badge reviewed">reviewed</span>
                </Show>
                <Show when={(c().risk ?? 0) >= RISK_HIGH}>
                  <span class="rc-tag risk" title={`revert-risk ${c().risk}`}>
                    high risk
                  </span>
                </Show>
                <For each={tags()}>{(t) => <span class="rc-tag">{t}</span>}</For>
                <Show
                  when={c().sha}
                  fallback={
                    <a class="cur-action" href={viewHref("edit", c().slug)}>
                      tag
                    </a>
                  }
                >
                  <span class="cur-tagger">
                    <button
                      type="button"
                      class="link-btn cur-action"
                      aria-expanded={tagOpen()}
                      onClick={() => setTagOpen((o) => !o)}
                    >
                      tag
                    </button>
                    <Show when={tagOpen()}>
                      <span class="cur-tagmenu">
                        <For each={TAG_PRESETS}>
                          {(t) => (
                            <button
                              type="button"
                              class="link-btn cur-tagopt"
                              disabled={tags().includes(t)}
                              onClick={() => applyTag(t)}
                            >
                              {t}
                            </button>
                          )}
                        </For>
                      </span>
                    </Show>
                  </span>
                </Show>
                <a class="cur-action" href={viewHref("talk", c().slug)}>
                  message author
                </a>
                <Show when={c().author}>
                  <a class="cur-action" href={contribHref(c())}>
                    contributions
                  </a>
                </Show>
                <Show when={c().sha}>
                  <button
                    type="button"
                    class="link-btn cur-rollback"
                    onClick={() => setConfirm("rollback")}
                  >
                    roll back
                  </button>
                </Show>
                <button
                  type="button"
                  class="link-btn cur-delete"
                  onClick={() => setConfirm("delete")}
                >
                  propose delete
                </button>
              </>
            )}
          </Show>
        </div>
      </Show>

      <ErrorNote msg={error()} />

      <Show when={confirm() && cur()}>
        {(c) => (
          <ConfirmDialog
            title={confirm() === "delete" ? "Delete page" : "Roll back revision"}
            subtitle={
              confirm() === "delete" ? (
                <>The page is removed but stays in git history.</>
              ) : (
                <>Restores this page to its state before the latest edit.</>
              )
            }
            body={
              confirm() === "delete" ? (
                <p>
                  Delete <strong>{prettify(c().slug)}</strong>? You can undelete it
                  later by restoring a past revision from its history.
                </p>
              ) : (
                <p>
                  Roll back <strong>{prettify(c().slug)}</strong> to before{" "}
                  <code>{c().sha?.slice(0, 7)}</code>? Any later changes are replaced.
                  The rollback is itself a revision, so it can be undone.
                </p>
              )
            }
            confirmLabel={
              busy() ? "Working…" : confirm() === "delete" ? "Delete" : "Roll back"
            }
            cancelLabel="Cancel"
            busy={busy()}
            onConfirm={runConfirmed}
            onCancel={() => setConfirm(undefined)}
          />
        )}
      </Show>
    </Show>
  );
}
