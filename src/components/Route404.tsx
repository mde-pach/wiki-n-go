import { For, Match, Show, Switch } from "solid-js";
import { config } from "../config";
import {
  adminHref,
  BASE,
  changesHref,
  parseRoute,
  prettify,
  readHref,
  reviewHref,
} from "../lib/paths";
import Appearance from "./Appearance";
import CategoryList from "./CategoryList";
import Discussion from "./Discussion";
import Editor from "./Editor";
import History from "./History";
import { Icons } from "./Icons";
import Infobox from "./Infobox";
import PageMeta from "./PageMeta";
import RecentChanges from "./RecentChanges";
import ReviewQueue from "./ReviewQueue";
import Toc from "./Toc";
import TocMobile from "./TocMobile";
import WikiPage from "./WikiPage";

const VIEW_TABS = [
  ["read", "Read"],
  ["edit", "Edit"],
  ["history", "History"],
] as const;

// The SPA fallback for pages not in the last build (e.g. just-created ones).
// It reproduces the same chrome the SSR pages get — title, tabs, TOC, rails,
// footer — so a new page looks identical to a built one (the no-rebuild promise),
// not a bare content fragment.
export default function Route404() {
  const { view, slug } = parseRoute();
  return (
    <Switch
      fallback={
        <>
          <PageHead slug={slug} view={view} />
          <Show when={view === "read"}>
            <main id="main" class="read-grid">
              <div class="col-toc">
                <Toc editHref={`${BASE}/edit/${slug}`} />
              </div>
              <div class="col-main">
                <TocMobile />
                <Infobox slug={slug} />
                <WikiPage slug={slug} />
              </div>
              <div class="col-info">
                <Appearance />
              </div>
            </main>
          </Show>
          <Show when={view === "edit"}>
            <main id="main" class="view-wrap">
              <Editor slug={slug} />
            </main>
          </Show>
          <Show when={view === "history"}>
            <main id="main" class="view-wrap">
              <History slug={slug} />
            </main>
          </Show>
          <Show when={view === "talk"}>
            <main id="main" class="view-wrap">
              <Discussion slug={slug} />
            </main>
          </Show>
          <Footer slug={slug} />
        </>
      }
    >
      <Match when={view === "category"}>
        <CategoryList cat={slug} />
      </Match>
      <Match when={view === "changes"}>
        <RecentChanges />
      </Match>
      <Match when={view === "review"}>
        <ReviewQueue />
      </Match>
    </Switch>
  );
}

function PageHead(props: { slug: string; view: string }) {
  const href = {
    read: readHref(props.slug),
    edit: `${BASE}/edit/${props.slug}`,
    history: `${BASE}/history/${props.slug}`,
    talk: `${BASE}/talk/${props.slug}`,
  };
  const namespace = props.view === "talk" ? "talk" : "article";
  const ref = encodeURIComponent(props.slug);
  const source = `${config.contentDir}/${props.slug}.md`;
  const toolLinks: { label: string; href: string; external?: boolean }[] = [
    { label: "What links here", href: `${BASE}/special?tab=backlinks&page=${ref}` },
    { label: "Page information", href: `${BASE}/special?tab=pageinfo&page=${ref}` },
    { label: "Cite this page", href: `${BASE}/cite` },
    { label: "Move or rename", href: `${BASE}/move?page=${ref}` },
    {
      label: "View page source",
      href: `https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${source}`,
      external: true,
    },
  ];
  return (
    <div class="page-head">
      <div class="page-head-inner">
        <h1 class="page-title">{prettify(props.slug)}</h1>
        <div class="page-meta-slot">
          <PageMeta slug={props.slug} base={BASE} />
        </div>
        <nav class="tabbar" aria-label="Page navigation">
          <div class="tab-group tab-ns">
            <a
              class={`tab${namespace === "article" ? " is-active" : ""}`}
              href={href.read}
            >
              <span class="tab-label">Article</span>
            </a>
            <a
              class={`tab${namespace === "talk" ? " is-active" : ""}`}
              href={href.talk}
              aria-current={props.view === "talk" ? "page" : undefined}
            >
              <span class="tab-label">Discussion</span>
            </a>
          </div>
          <div class="tab-group tab-views">
            <For each={VIEW_TABS}>
              {([id, label]) => (
                <a
                  class={`tab${props.view === id ? " is-active" : ""}`}
                  href={href[id]}
                  aria-current={props.view === id ? "page" : undefined}
                >
                  <span class="tab-label">{label}</span>
                </a>
              )}
            </For>
            <details class="page-tools tab-tools">
              <summary class="tab">
                <span class="tab-label">Tools</span>
                <Icons.Chevron class="chev" />
              </summary>
              <div class="menu" role="menu">
                <span class="menu-label">Page tools</span>
                <For each={toolLinks}>
                  {(t) => (
                    <a
                      class="menu-item"
                      role="menuitem"
                      href={t.href}
                      target={t.external ? "_blank" : undefined}
                      rel={t.external ? "noreferrer" : undefined}
                    >
                      {t.label}
                    </a>
                  )}
                </For>
              </div>
            </details>
          </div>
        </nav>
      </div>
    </div>
  );
}

function Footer(props: { slug: string }) {
  const source = `${config.contentDir}/${props.slug}.md`;
  const sourceUrl = `https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${source}`;
  return (
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-tools">
          <a href={changesHref}>Recent changes</a>
          <span class="sep">·</span>
          <a href={reviewHref}>Pending review</a>
          <span class="sep">·</span>
          <a href={adminHref}>Admin</a>
        </div>
        <div class="footer-bottom">
          <p class="fb-license">
            Text is available under the CC BY-SA 4.0 license; the Wikigit software is
            MIT-licensed. Content is stored as Markdown and is editable by anyone.
          </p>
          <a class="provenance" href={sourceUrl} target="_blank" rel="noreferrer">
            <span>
              View page source · <span class="mono">{source}</span>
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
