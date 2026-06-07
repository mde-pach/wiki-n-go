import { createEffect, createSignal, For, Show } from "solid-js";
import {
  deleteNamedDraft,
  draftsForSlug,
  loadDrafts,
  type NamedDraft,
} from "../lib/draft";
import { timeAgo } from "../lib/format";
import { BASE, prettify } from "../lib/paths";

function resumeHref(d: NamedDraft): string {
  return `${BASE}/edit/${d.slug}?draft=${d.id}`;
}

// Saved-drafts list, reused on /new (all drafts) and in the editor (one slug).
// Drafts live in localStorage; `refresh` lets the host re-pull after it saves a
// new one (the editor bumps it on save) since storage isn't reactive.
export default function DraftList(props: {
  slug?: string;
  heading?: string;
  refresh?: () => unknown;
}) {
  const [drafts, setDrafts] = createSignal<NamedDraft[]>([]);

  createEffect(() => {
    props.refresh?.();
    const all = loadDrafts();
    setDrafts(props.slug ? draftsForSlug(all, props.slug) : all);
  });

  function remove(id: string) {
    deleteNamedDraft(id);
    setDrafts((ds) => ds.filter((d) => d.id !== id));
  }

  return (
    <Show when={drafts().length}>
      <div class="draft-list">
        <Show when={props.heading}>
          <h3>{props.heading}</h3>
        </Show>
        <ul>
          <For each={drafts()}>
            {(d) => (
              <li class="draft-row">
                <a class="draft-name" href={resumeHref(d)}>
                  {d.name || "Untitled draft"}
                </a>
                <span class="draft-meta">
                  <Show when={!props.slug}>
                    <span class="mono">{prettify(d.slug)}</span> ·{" "}
                  </Show>
                  saved {timeAgo(d.savedAt)}
                </span>
                <span class="draft-actions">
                  <a href={resumeHref(d)}>Resume</a>
                  <button type="button" class="link-btn" onClick={() => remove(d.id)}>
                    Delete
                  </button>
                </span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
}
