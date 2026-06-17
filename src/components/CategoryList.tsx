import { createMemo, For, Show } from "solid-js";
import { type CatGroup, groupCategory, parseCategoryQuery } from "../lib/categories";
import { getLinkGraph } from "../lib/linkgraph";
import { categoryHref, prettify, readHref } from "../lib/paths";
import { clientResource } from "../lib/solid";
import { Status, ViewHead } from "./ui";

// Category member page. Membership, the subcategory hierarchy and tag
// intersections are all derived at read time from the link-graph index (the
// Worker's live one, static `*.json` as fallback) — no rebuild on a tag change.
export default function CategoryList(props: { cat?: string }) {
  const [graph] = clientResource(getLinkGraph);
  const request = createMemo(() => parseCategoryQuery(props.cat ?? ""));
  const labels = () => request().map(prettify);
  const group = createMemo<CatGroup | null>(() => {
    const g = graph();
    return g ? groupCategory(g, request()) : null;
  });

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title={<>Category: {labels().join(" ∩ ") || "—"}</>}
        sub={
          request().length > 1
            ? `Pages in all of: ${labels().join(", ")}.`
            : `Pages tagged “${labels()[0] ?? ""}”. Membership is read live.`
        }
      />
      <Show
        when={request().length > 0}
        fallback={<Status>No category selected.</Status>}
      >
        <Show when={group()} fallback={<Status>Loading the link graph…</Status>}>
          {(grp) => <CategoryBody group={grp()} />}
        </Show>
      </Show>
    </main>
  );
}

function CategoryBody(props: { group: CatGroup }) {
  const g = () => props.group;
  return (
    <Show
      when={g().total > 0}
      fallback={<Status>No pages in this category yet.</Status>}
    >
      <Show when={g().maintenance}>
        <p class="cat-note">
          A maintenance category, tracking cleanup work rather than a topic.
        </p>
      </Show>

      <Show when={g().parents.length > 0}>
        <div class="cat-parents">
          <span class="cat-label">Subcategory of</span>
          <For each={g().parents}>
            {(p) => (
              <a class="chip chip-link" href={categoryHref(p)}>
                {prettify(p)}
              </a>
            )}
          </For>
        </div>
      </Show>

      <Show when={g().subcategories.length > 0}>
        <section class="cat-section">
          <h3>Subcategories</h3>
          <ul class="category-list">
            <For each={g().subcategories}>
              {(m) => (
                <li>
                  <a href={categoryHref(m.cat ?? m.slug)}>{m.title}</a>
                  <span class="sp-count">{m.count} pages</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={g().pages.length > 0}>
        <section class="cat-section">
          <h3>Pages</h3>
          <ul class="category-list">
            <For each={g().pages}>
              {(m) => (
                <li>
                  <a href={readHref(m.slug)}>{m.title}</a>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </Show>
  );
}
