import { For, Show } from "solid-js";
import { type Change, listChanges } from "../lib/changes";
import { timeAgo } from "../lib/format";
import { prettify, readHref } from "../lib/paths";
import { clientResource } from "../lib/solid";
import PageCuration from "./PageCuration";
import { Status, ViewHead } from "./ui";

interface NewPage {
  slug: string;
  change: Change;
}

export default function NewPages() {
  const [changes, { refetch }] = clientResource(() => 60, listChanges);

  const pages = () => {
    const out: NewPage[] = [];
    for (const c of changes() ?? [])
      for (const slug of c.created) out.push({ slug, change: c });
    return out;
  };

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="New pages"
        sub="Recently created pages — triage each from the curation toolbar: approve, tag, message the author, or propose deletion. A deleted page stays in git history (undelete by restoring a past revision)."
      />

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
                  <span class="np-author" classList={{ anon: p.change.isAnon }}>
                    {p.change.author}
                  </span>
                  <span class="np-time">{timeAgo(p.change.date)}</span>
                  <PageCuration slug={p.slug} change={p.change} onChanged={refetch} />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
