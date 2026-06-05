import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { getLinkGraph } from "../lib/linkgraph";
import { BASE, readHref } from "../lib/paths";

type Tab = "backlinks" | "wanted" | "orphaned" | "deadend";
const TABS: { id: Tab; label: string }[] = [
  { id: "backlinks", label: "What links here" },
  { id: "wanted", label: "Wanted pages" },
  { id: "orphaned", label: "Orphaned pages" },
  { id: "deadend", label: "Dead-end pages" },
];

export default function Special() {
  const [graph] = createResource(() => (isServer ? undefined : "go"), getLinkGraph);
  const q = isServer ? new URLSearchParams() : new URLSearchParams(location.search);
  const [tab, setTab] = createSignal<Tab>(
    TABS.some((t) => t.id === q.get("show")) ? (q.get("show") as Tab) : "backlinks",
  );
  const [page, setPage] = createSignal(q.get("page") ?? "");

  const slugs = createMemo(() => {
    const g = graph();
    if (!g) return [];
    return Object.keys(g.titles).sort((a, b) => g.titles[a].localeCompare(g.titles[b]));
  });
  const title = (slug: string) => graph()?.titles[slug] ?? slug;
  const linksHere = () => graph()?.backlinks[page()] ?? [];

  return (
    <div class="special">
      <div class="view-head">
        <h2>Special pages</h2>
        <p>
          Reports computed from the wiki's link graph — backlinks, wanted, orphaned and
          dead-end pages.
        </p>
      </div>

      <nav class="special-tabs" aria-label="Reports">
        <For each={TABS}>
          {(t) => (
            <button
              type="button"
              class={`sp-tab${tab() === t.id ? " is-active" : ""}`}
              aria-pressed={tab() === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )}
        </For>
      </nav>

      <Show
        when={graph()}
        fallback={<p class="wiki-status">Loading the link graph…</p>}
      >
        {(g) => (
          <>
            <Show when={tab() === "backlinks"}>
              <div class="sp-picker">
                <label for="sp-page">Show pages that link to</label>
                <select
                  id="sp-page"
                  class="input"
                  value={page()}
                  onChange={(e) => setPage(e.currentTarget.value)}
                >
                  <option value="">Choose a page…</option>
                  <For each={slugs()}>
                    {(s) => <option value={s}>{title(s)}</option>}
                  </For>
                </select>
              </div>
              <Show
                when={page()}
                fallback={<p class="wiki-status">Pick a page to see its backlinks.</p>}
              >
                <Show
                  when={linksHere().length > 0}
                  fallback={
                    <p class="wiki-status">No pages link to “{title(page())}” yet.</p>
                  }
                >
                  <ul class="special-list">
                    <For each={linksHere()}>
                      {(s) => (
                        <li>
                          <a href={readHref(s)}>{title(s)}</a>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </Show>

            <Show when={tab() === "wanted"}>
              <Show
                when={g().wanted.length > 0}
                fallback={
                  <p class="wiki-status">No wanted pages — every link resolves.</p>
                }
              >
                <ul class="special-list">
                  <For each={g().wanted}>
                    {(w) => (
                      <li>
                        <a class="wikilink is-red" href={`${BASE}/edit/${w.slug}`}>
                          {w.slug}
                        </a>
                        <span class="sp-count">
                          wanted by {w.by.length} {w.by.length === 1 ? "page" : "pages"}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>

            <Show when={tab() === "orphaned"}>
              <ReportList
                items={g().orphans}
                title={title}
                empty="No orphaned pages — everything is linked."
              />
            </Show>
            <Show when={tab() === "deadend"}>
              <ReportList
                items={g().deadends}
                title={title}
                empty="No dead-end pages — every page links onward."
              />
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

function ReportList(props: {
  items: string[];
  title: (s: string) => string;
  empty: string;
}) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={<p class="wiki-status">{props.empty}</p>}
    >
      <ul class="special-list">
        <For each={props.items}>
          {(s) => (
            <li>
              <a href={readHref(s)}>{props.title(s)}</a>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
