import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { deletePage } from "../lib/admin";
import { listChanges } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { ErrorNote, Status, ViewHead } from "./ui";

interface NewPage {
  slug: string;
  author: string;
  isAnon: boolean;
  date: string;
  patrolled: boolean;
}

export default function NewPages() {
  const [changes, { refetch }] = createResource(
    () => (isServer ? undefined : 60),
    listChanges,
  );

  const pages = () => {
    const out: NewPage[] = [];
    for (const c of changes() ?? [])
      for (const slug of c.created)
        out.push({
          slug,
          author: c.author,
          isAnon: c.isAnon,
          date: c.date,
          patrolled: c.patrolled,
        });
    return out;
  };

  const [confirm, setConfirm] = createSignal<NewPage>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function doDelete() {
    const p = confirm();
    if (!p) return;
    setBusy(true);
    setError();
    try {
      await deletePage(p.slug);
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
        title="New pages"
        sub="Recently created pages — patrol from Recent changes, or delete spam here. A deleted page stays in git history (undelete by restoring a past revision)."
      />

      <ErrorNote msg={error()} />

      <Show when={changes()} fallback={<Status>Loading new pages…</Status>}>
        <Show
          when={pages().length > 0}
          fallback={<Status>No pages created recently.</Status>}
        >
          <ul class="np-list">
            <For each={pages()}>
              {(p) => (
                <li class="np-row">
                  <a class="np-page" href={readHref(p.slug)}>
                    {prettify(p.slug)}
                  </a>
                  <span class="np-author" classList={{ anon: p.isAnon }}>
                    {p.author}
                  </span>
                  <span class="np-time">{timeAgo(p.date)}</span>
                  <Show
                    when={p.patrolled}
                    fallback={<span class="rc-badge">unreviewed</span>}
                  >
                    <span class="rc-badge reviewed">reviewed</span>
                  </Show>
                  <button
                    type="button"
                    class="link-btn np-delete"
                    onClick={() => setConfirm(p)}
                  >
                    delete
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={confirm()}>
        {(p) => (
          <ConfirmDialog
            title="Delete page"
            subtitle={<>The page is removed but stays in git history.</>}
            body={
              <p>
                Delete <strong>{prettify(p().slug)}</strong>? You can undelete it later
                by restoring a past revision from its history.
              </p>
            }
            confirmLabel={busy() ? "Deleting…" : "Delete"}
            cancelLabel="Cancel"
            busy={busy()}
            onConfirm={doDelete}
            onCancel={() => setConfirm(undefined)}
          />
        )}
      </Show>
    </main>
  );
}
