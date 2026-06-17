import { createSignal, For, Show } from "solid-js";
import { config } from "../config";
import { rollbackCommit } from "../lib/admin";
import { AUTOMOD_AUTHOR, type Change, listChanges } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { clientResource } from "../lib/solid";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote, Status, ViewHead } from "./ui";

// Bot actions: edits the automoderator auto-reverted. Undo restores the
// contributor's version — rolling back the bot's revert commit replays the page
// to its pre-revert (i.e. contributor) state, the recourse for a false positive.
export default function Automoderator() {
  if (!config.workerUrl) return null;

  const [changes, { refetch }] = clientResource(() => 50, listChanges);
  const rows = () => (changes() ?? []).filter((c) => c.author === AUTOMOD_AUTHOR);

  const [confirm, setConfirm] = createSignal<Change>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function undo() {
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

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Automoderator"
        sub="Edits the bot auto-reverted as high-confidence vandalism. Undo restores the contributor's edit."
      />

      <ErrorNote msg={error()} />

      <Show when={changes()} fallback={<Status>Loading…</Status>}>
        <Show
          when={rows().length > 0}
          fallback={<Status>No automatic reverts yet.</Status>}
        >
          <ul class="rc-list">
            <For each={rows()}>
              {(c) => (
                <li class="rc-row">
                  <span class="rc-time">{timeAgo(c.date)}</span>
                  <span class="rc-pages">
                    <For each={c.slugs}>
                      {(s, i) => (
                        <>
                          {i() > 0 ? ", " : ""}
                          <a href={readHref(s)}>{prettify(s)}</a>
                        </>
                      )}
                    </For>
                  </span>
                  <span class="rc-summary">{c.message}</span>
                  <span class="rc-actions">
                    <button
                      type="button"
                      class="link-btn rc-rollback"
                      onClick={() => setConfirm(c)}
                    >
                      restore contributor's edit
                    </button>
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
            title="Restore the contributor's edit"
            subtitle={
              <>Reverses this automatic revert — treat it as a false positive.</>
            }
            body={
              <p>
                Restore{" "}
                <strong>
                  {c()
                    .slugs.map((s) => prettify(s))
                    .join(", ")}
                </strong>{" "}
                to the contributor's version? This undoes the bot's revert and is itself
                a reversible revision.
              </p>
            }
            confirmLabel={busy() ? "Restoring…" : "Restore"}
            cancelLabel="Cancel"
            busy={busy()}
            onConfirm={undo}
            onCancel={() => setConfirm(undefined)}
          />
        )}
      </Show>
    </main>
  );
}
