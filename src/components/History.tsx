import { createSignal, For, Show } from "solid-js";
import { config } from "../config";
import { restoreRevision } from "../lib/admin";
import { type DLine, parseDiff } from "../lib/diff";
import { getDiff, getHistory, type Revision } from "../lib/history";
import { readHref, slugFromLocation } from "../lib/paths";
import { clientResource, useWhoami } from "../lib/solid";
import { errMessage } from "../lib/util";
import DiffView from "./DiffView";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote, ViewHead } from "./ui";

export default function History(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const revs = clientResource(slug, getHistory);
  const [diff, setDiff] = createSignal<{
    a: string;
    b: string;
    lines: DLine[] | null;
    aHref?: string;
    bHref?: string;
    permalink?: string;
  }>();
  const [err, setErr] = createSignal<string>();
  const latest = () => revs()?.[0]?.sha;

  // Revisions are listed newest-first, so the "newer" pick is always the lower
  // index. Defaults compare the two most recent (current vs previous).
  const [cmpNew, setCmpNew] = createSignal(0);
  const [cmpOld, setCmpOld] = createSignal(1);

  function compareSelected() {
    const list = revs();
    const older = list?.[cmpOld()];
    const newer = list?.[cmpNew()];
    if (older && newer) show(older.sha, newer.sha);
  }

  const { isMaintainer } = useWhoami();
  const [restoring, setRestoring] = createSignal<Revision>();
  const [busy, setBusy] = createSignal(false);

  async function doRestore() {
    const r = restoring();
    if (!r) return;
    setBusy(true);
    setErr();
    try {
      await restoreRevision(slug(), r.sha);
      window.location.assign(readHref(slug()));
    } catch (e) {
      setErr(errMessage(e));
      setBusy(false);
    }
  }

  async function show(base: string | null, head: string) {
    setErr();
    const permalink = `${readHref(slug())}?rev=${head}`;
    if (!base) {
      setDiff({
        a: "(none)",
        b: short(head),
        lines: null,
        bHref: commitUrl(head),
        permalink,
      });
      return;
    }
    try {
      const patch = await getDiff(slug(), base, head);
      setDiff({
        a: short(base),
        b: short(head),
        lines: patch ? parseDiff(patch) : null,
        aHref: commitUrl(base),
        bHref: commitUrl(head),
        permalink,
      });
    } catch (e) {
      setErr(errMessage(e));
    }
  }

  return (
    <div>
      <ViewHead
        title="Revision history"
        sub="Every edit is a revision. Compare any revision with the previous one or the current page."
      />

      <Show when={revs()} fallback={<RevSkeleton />}>
        <div class="rev-compare-bar">
          <button
            type="button"
            class="btn btn-outline btn-sm"
            disabled={(revs()?.length ?? 0) < 2}
            onClick={compareSelected}
          >
            Compare selected revisions
          </button>
          <span class="rcb-hint">
            Pick an older (left) and newer (right) revision, or use the cur / prev
            links.
          </span>
        </div>
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
                <div class="rev-radios">
                  <span class="rr-col">
                    <input
                      type="radio"
                      name="cmp-old"
                      aria-label="Compare from this (older) revision"
                      checked={cmpOld() === i()}
                      disabled={i() <= cmpNew()}
                      onChange={() => setCmpOld(i())}
                    />
                  </span>
                  <span class="rr-col">
                    <input
                      type="radio"
                      name="cmp-new"
                      aria-label="Compare to this (newer) revision"
                      checked={cmpNew() === i()}
                      disabled={i() >= cmpOld()}
                      onChange={() => setCmpNew(i())}
                    />
                  </span>
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
                    <a class="rev-permalink" href={`${readHref(slug())}?rev=${r.sha}`}>
                      permalink
                    </a>
                    <Show when={isMaintainer() && i() !== 0}>
                      <button
                        type="button"
                        class="link-btn rev-restore"
                        onClick={() => setRestoring(r)}
                      >
                        restore
                      </button>
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
        {(d) => (
          <DiffView
            lines={d().lines}
            a={d().a}
            b={d().b}
            aHref={d().aHref}
            bHref={d().bHref}
            permalink={d().permalink}
          />
        )}
      </Show>
      <ErrorNote msg={err()} />

      <Show when={restoring()}>
        {(r) => (
          <ConfirmDialog
            title="Restore this revision"
            subtitle={<>The current page content will be replaced.</>}
            body={
              <p>
                Restore this page to its content at <code>{r().sha.slice(0, 7)}</code>?
                The current version is replaced, but kept in history — this restore is
                itself a new revision.
              </p>
            }
            confirmLabel={busy() ? "Restoring…" : "Restore"}
            cancelLabel="Cancel"
            busy={busy()}
            onConfirm={doRestore}
            onCancel={() => setRestoring(undefined)}
          />
        )}
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
            <div class="rev-radios" />
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
