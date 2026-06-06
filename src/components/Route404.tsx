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
  userLogin,
} from "../lib/paths";
import { useWhoami } from "../lib/solid";
import Appearance from "./Appearance";
import CategoryList from "./CategoryList";
import Contributions from "./Contributions";
import Discussion from "./Discussion";
import Editor from "./Editor";
import History from "./History";
import Infobox from "./Infobox";
import PageMeta from "./PageMeta";
import RecentChanges from "./RecentChanges";
import ReviewQueue from "./ReviewQueue";
import Toc from "./Toc";
import TocMobile from "./TocMobile";
import WikiPage from "./WikiPage";

const TABS = [
  ["read", "Read"],
  ["edit", "Edit"],
  ["history", "History"],
  ["talk", "Talk"],
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
          <Show when={view === "user"}>
            <main id="main" class="read-grid">
              <div class="col-toc" />
              <div class="col-main">
                <ProfileBody slug={slug} />
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
  // A profile is the read view of its `user/<login>` page, so the Read tab is active.
  const active = props.view === "user" ? "read" : props.view;
  const login = userLogin(props.slug);
  const title = login ? `User: ${login}` : prettify(props.slug);

  // A profile's Edit tab is for its owner only — others (maintainers included)
  // would just hit a 403. Hidden until whoami resolves so it never flashes.
  const { who } = useWhoami();
  const canEdit = () => {
    if (!login) return true;
    const w = who();
    return !!w && !w.isAnon && w.author.toLowerCase() === login;
  };
  const tabs = () => TABS.filter(([id]) => id !== "edit" || canEdit());

  return (
    <div class="page-head">
      <div class="page-head-inner">
        <h1 class="page-title">{title}</h1>
        <div class="page-meta-slot">
          <PageMeta slug={props.slug} base={BASE} />
        </div>
        <nav class="tabbar" aria-label="Page views">
          <For each={tabs()}>
            {([id, label]) => (
              <a
                class={`tab${active === id ? " is-active" : ""}`}
                href={href[id]}
                aria-current={active === id ? "page" : undefined}
              >
                <span class="tab-label">{label}</span>
              </a>
            )}
          </For>
        </nav>
      </div>
    </div>
  );
}

// A profile page body: the editable user page plus the auto-rendered contributions
// panel. Anonymous ids own no page (an `ip_hash` can't prove ownership), so they
// get a soft "no profile" note that points at their contributions filter instead.
function ProfileBody(props: { slug: string }) {
  const login = () => userLogin(props.slug);
  const { who } = useWhoami();
  const canEdit = (owner: string) => {
    const w = who();
    return !!w && !w.isAnon && w.author.toLowerCase() === owner;
  };
  return (
    <Show when={login()} fallback={<NoProfile />}>
      {(l) => (
        <Show when={!l().startsWith("anon-")} fallback={<NoProfile anon={l()} />}>
          <WikiPage slug={props.slug} noCreate={!canEdit(l())} />
          <Contributions login={l()} />
        </Show>
      )}
    </Show>
  );
}

function NoProfile(props: { anon?: string }) {
  return (
    <div class="wiki-status">
      <Show when={props.anon} fallback={<>No user specified.</>}>
        {(name) => (
          <>
            <span class="mono">{name()}</span> is an anonymous contributor and has no
            profile page.{" "}
            <a href={`${changesHref}?author=${name()}`}>See their contributions →</a>
          </>
        )}
      </Show>
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
