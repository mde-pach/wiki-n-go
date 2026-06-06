import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getLinkGraph, graphStats, type LinkGraph, mostLinked } from "../lib/linkgraph";
import { BASE, readHref } from "../lib/paths";
import { clientResource } from "../lib/solid";
import { PagePicker } from "./special/PagePicker";
import { ReportList } from "./special/ReportList";
import { Status, ViewHead } from "./ui";

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

interface ReportContext {
  g: LinkGraph;
  title: (slug: string) => string;
  slugs: string[];
  redirectFroms: Set<string>;
}

type ReportConfig = (ctx: ReportContext) => JSX.Element;

function slugLink(title: (slug: string) => string) {
  return (slug: string) => <a href={readHref(slug)}>{title(slug)}</a>;
}

const REPORTS: Partial<Record<Tab, ReportConfig>> = {
  orphaned: ({ g, title }) => (
    <ReportList
      items={g.orphans}
      render={slugLink(title)}
      empty="No orphaned pages — everything is linked."
    />
  ),
  deadend: ({ g, title }) => (
    <ReportList
      items={g.deadends}
      render={slugLink(title)}
      empty="No dead-end pages — every page links onward."
    />
  ),
  allpages: ({ slugs, title, redirectFroms }) => (
    <ReportList
      items={slugs}
      render={slugLink(title)}
      empty="No pages yet."
      trailing={(s) => (
        <Show when={redirectFroms.has(s)}>
          <span class="sp-count">redirect</span>
        </Show>
      )}
    />
  ),
  mostlinked: ({ g, title }) => (
    <ReportList
      items={mostLinked(g)}
      render={(m) => <a href={readHref(m.slug)}>{title(m.slug)}</a>}
      empty="No internal links yet."
      trailing={(m) => (
        <span class="sp-count">
          {m.count} {m.count === 1 ? "link" : "links"}
        </span>
      )}
    />
  ),
  wanted: ({ g }) => (
    <ReportList
      items={g.wanted}
      render={(w) => (
        <a class="wikilink is-red" href={`${BASE}/edit/${w.slug}`}>
          {w.slug}
        </a>
      )}
      empty="No wanted pages — every link resolves."
      trailing={(w) => (
        <span class="sp-count">
          wanted by {w.by.length} {w.by.length === 1 ? "page" : "pages"}
        </span>
      )}
    />
  ),
  redirects: ({ g, title }) => (
    <ReportList
      items={g.redirects}
      empty="No redirects yet."
      render={(r) => (
        <>
          <a href={`${readHref(r.from)}?redirect=no`}>{title(r.from)}</a>
          <span class="sp-arrow">→</span>
          <Show
            when={!r.broken}
            fallback={<span class="sp-badge sp-broken">{r.to} (missing)</span>}
          >
            <a href={readHref(r.to)}>{title(r.to)}</a>
          </Show>
          <Show when={r.double}>
            <span class="sp-badge sp-double">double redirect</span>
          </Show>
        </>
      )}
    />
  ),
};

export default function Special() {
  const graph = clientResource(getLinkGraph);
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
      <ViewHead
        title="Special pages"
        sub="Reports computed from the wiki's link graph — backlinks, wanted, orphaned and dead-end pages."
      />

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
        <a class="sp-tab sp-random" href={`${BASE}/new`}>
          Create a page ↗
        </a>
      </nav>

      <Show when={graph()} fallback={<Status>Loading the link graph…</Status>}>
        {(g) => (
          <>
            <Show when={tab() === "backlinks"}>
              <PagePicker
                id="sp-page"
                label="Show pages that link to"
                value={page()}
                slugs={slugs()}
                title={title}
                onChange={setPage}
              />
              <Show
                when={page()}
                fallback={<Status>Pick a page to see its backlinks.</Status>}
              >
                <ReportList
                  items={linksHere()}
                  render={slugLink(title)}
                  empty={`No pages link to “${title(page())}” yet.`}
                />
              </Show>
            </Show>

            <Show when={tab() === "pageinfo"}>
              <PagePicker
                id="sp-info"
                label="Page"
                value={page()}
                slugs={slugs()}
                title={title}
                onChange={setPage}
              />
              <Show
                when={page() && g().titles[page()] !== undefined}
                fallback={<Status>Pick a page to see its details.</Status>}
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

            <For each={Object.entries(REPORTS)}>
              {([id, report]) => (
                <Show when={tab() === id}>
                  {report({
                    g: g(),
                    title,
                    slugs: slugs(),
                    redirectFroms: redirectFroms(),
                  })}
                </Show>
              )}
            </For>

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
