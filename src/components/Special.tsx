import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getLinkGraph, graphStats, mostLinked } from "../lib/linkgraph";
import { BASE, readHref } from "../lib/paths";

type Tab =
  | "backlinks"
  | "pageinfo"
  | "wanted"
  | "orphaned"
  | "deadend"
  | "redirects"
  | "allpages"
  | "mostlinked"
  | "stats";
const TABS: { id: Tab; label: string }[] = [
  { id: "backlinks", label: "What links here" },
  { id: "pageinfo", label: "Page info" },
  { id: "allpages", label: "All pages" },
  { id: "mostlinked", label: "Most linked" },
  { id: "wanted", label: "Wanted pages" },
  { id: "orphaned", label: "Orphaned pages" },
  { id: "deadend", label: "Dead-end pages" },
  { id: "redirects", label: "Redirects" },
  { id: "stats", label: "Statistics" },
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
  const redirectFroms = createMemo(
    () => new Set(graph()?.redirects.map((r) => r.from) ?? []),
  );

  function randomPage() {
    const g = graph();
    if (!g) return;
    const pages = Object.keys(g.titles).filter((s) => !redirectFroms().has(s));
    if (pages.length)
      window.location.href = readHref(pages[Math.floor(Math.random() * pages.length)]);
  }

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
        <button type="button" class="sp-tab sp-random" onClick={randomPage}>
          Random page ↗
        </button>
        <a class="sp-tab sp-random" href={`${BASE}/cite`}>
          Cite a source ↗
        </a>
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

            <Show when={tab() === "pageinfo"}>
              <div class="sp-picker">
                <label for="sp-info">Page</label>
                <select
                  id="sp-info"
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
                when={page() && g().titles[page()] !== undefined}
                fallback={<p class="wiki-status">Pick a page to see its details.</p>}
              >
                <dl class="sp-stats">
                  <div>
                    <dt>Title</dt>
                    <dd>{title(page())}</dd>
                  </div>
                  <div>
                    <dt>Slug</dt>
                    <dd class="mono">{page()}</dd>
                  </div>
                  <div>
                    <dt>Links here</dt>
                    <dd>{g().backlinks[page()]?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Redirects here</dt>
                    <dd>{g().redirects.filter((r) => r.to === page()).length}</dd>
                  </div>
                  <Show when={g().redirects.find((r) => r.from === page())}>
                    {(r) => (
                      <div>
                        <dt>Redirects to</dt>
                        <dd>
                          <a href={readHref(r().to)}>{title(r().to)}</a>
                        </dd>
                      </div>
                    )}
                  </Show>
                </dl>
                <p class="sp-info-links">
                  <a href={readHref(page())}>Read</a> ·{" "}
                  <a href={`${BASE}/history/${page()}`}>History</a> ·{" "}
                  <a href={`${BASE}/move?page=${page()}`}>Move/rename</a> ·{" "}
                  <a
                    href={`https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${config.contentDir}/${page()}.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source on GitHub
                  </a>
                </p>
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
            <Show when={tab() === "redirects"}>
              <Show
                when={g().redirects.length > 0}
                fallback={<p class="wiki-status">No redirects yet.</p>}
              >
                <ul class="special-list">
                  <For each={g().redirects}>
                    {(r) => (
                      <li>
                        <a href={`${readHref(r.from)}?redirect=no`}>{title(r.from)}</a>
                        <span class="sp-arrow">→</span>
                        <Show
                          when={!r.broken}
                          fallback={
                            <span class="sp-badge sp-broken">{r.to} (missing)</span>
                          }
                        >
                          <a href={readHref(r.to)}>{title(r.to)}</a>
                        </Show>
                        <Show when={r.double}>
                          <span class="sp-badge sp-double">double redirect</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>

            <Show when={tab() === "allpages"}>
              <ul class="special-list">
                <For each={slugs()}>
                  {(s) => (
                    <li>
                      <a href={readHref(s)}>{title(s)}</a>
                      <Show when={redirectFroms().has(s)}>
                        <span class="sp-count">redirect</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <Show when={tab() === "mostlinked"}>
              <Show
                when={mostLinked(g()).length > 0}
                fallback={<p class="wiki-status">No internal links yet.</p>}
              >
                <ul class="special-list">
                  <For each={mostLinked(g())}>
                    {(m) => (
                      <li>
                        <a href={readHref(m.slug)}>{title(m.slug)}</a>
                        <span class="sp-count">
                          {m.count} {m.count === 1 ? "link" : "links"}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>

            <Show when={tab() === "stats"}>
              <dl class="sp-stats">
                <For each={Object.entries(graphStats(g()))}>
                  {([k, v]) => (
                    <div>
                      <dt>{STAT_LABELS[k] ?? k}</dt>
                      <dd>{v}</dd>
                    </div>
                  )}
                </For>
              </dl>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  pages: "Content pages",
  redirects: "Redirects",
  links: "Internal links",
  wanted: "Wanted (red links)",
  orphans: "Orphaned pages",
  deadends: "Dead-end pages",
};

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
