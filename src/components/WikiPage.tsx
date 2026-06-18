import {
  batch,
  createSignal,
  lazy,
  Match,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import { Portal } from "solid-js/web";
import type { EditResult } from "../lib/api";
import { classifyTags } from "../lib/categories";
import {
  fetchMarkdown,
  fetchMarkdownAt,
  PageNotFoundError,
  resolveVersions,
} from "../lib/content";
import { decorate as decorateArticle } from "../lib/decorate";
import { findSection, type SectionSpan } from "../lib/editor-section";
import type { PageMeta } from "../lib/frontmatter";
import { infoboxHtml } from "../lib/infobox";
import { pageSet } from "../lib/manifest";
import {
  BASE,
  categoryHref,
  langOf,
  prettify,
  readHref,
  slugFromLocation,
} from "../lib/paths";
import { errMessage } from "../lib/util";
import { markRedLinksHtml } from "../lib/wikilink";
import { Icons } from "./Icons";

// The section editor (and the diff/submit stack it pulls in) is only needed once
// a reader clicks a heading's [edit], so keep it off the read-path island bundle
// and load it on demand — the read path stays light. Mermaid uses the same trick.
const FocusedEditor = lazy(() => import("./editor/FocusedEditor"));

// The markdown engine (markdown-it + plugins + DOMPurify) is the heaviest chunk
// on the read path, yet it's only needed to client-render a page when its baked
// copy is stale. When the baked copy is current we paint the build-rendered HTML
// directly and never load this. Keep it out of the island's hydration chunk and
// pull it on demand. Memoized so it downloads once.
let mdModule: Promise<typeof import("../lib/markdown")> | undefined;
const loadMarkdown = () => {
  mdModule ??= import("../lib/markdown");
  return mdModule;
};

// A section `[edit]` that's been opened in place: the editor is portaled into
// `mountEl` (inserted right after the heading) so it edits the section without
// leaving the read page.
interface SectionEdit {
  mountEl: HTMLElement;
  doc: string;
  // Rebuilds the full document from an edited body, re-attaching the page's
  // frontmatter — captured here so withFrontmatter stays in the lazy chunk.
  reconstruct: (body: string) => string;
  body: string;
  span: SectionSpan;
  // The rendered nodes of the section being edited, hidden while the editor is
  // open so the editor's live preview is the only copy of the section on screen.
  hidden: HTMLElement[];
}

export default function WikiPage(props: {
  slug?: string;
  // Build-time page identity, used to decide whether the baked HTML is current:
  // `bakedSha` is the page's git blob sha at build, `title` its build-time title.
  // The rendered HTML itself is read from a sibling <noscript>, not passed here.
  bakedSha?: string;
  title?: string;
  meta?: PageMeta;
  // A profile page only the owner/maintainer may create → suppress the "Create
  // it →" invite for everyone else (they'd be refused anyway).
  noCreate?: boolean;
  // The page chrome already set `.page-title` to a final value the fetched
  // content can't improve on (e.g. a profile's "User: <login>"). Leave it alone
  // so it never blinks from the owner's title to the slug/frontmatter one.
  titleOwned?: boolean;
}) {
  const slug = () => props.slug ?? slugFromLocation();
  // Bake the quick-facts card in as the article's first child so it floats
  // inside the prose flow (text wraps around it instead of sliding under it).
  const withInfobox = (h: string | undefined, m: PageMeta | undefined) =>
    h === undefined ? h : infoboxHtml(slug(), m ?? {}) + h;
  // Start empty (skeleton). Content is committed to the DOM only once we know
  // which copy is correct: the baked HTML when the staleness check confirms it's
  // current, otherwise the file fetched from the CDN. We never paint baked then
  // swap to latest — that flash is the thing this avoids.
  const [html, setHtml] = createSignal<string>();
  const [meta, setMeta] = createSignal<PageMeta>({});
  const [notFound, setNotFound] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [redirectedFrom, setRedirectedFrom] = createSignal<string>();
  const [revOf, setRevOf] = createSignal<string>();
  // The raw markdown in hand, so a section `[edit]` can slice it. Populated by the
  // stale path's fetch, or lazily fetched on the first section edit of a baked page.
  const [raw, setRaw] = createSignal<string>();
  const [sectionEdit, setSectionEdit] = createSignal<SectionEdit>();
  // The exact document a live publish just committed. We render it straight from
  // hand on close — no refetch, so no waiting on the Worker's cached `/latest`
  // (or the CDN) to catch up to a commit we already hold.
  let publishedDoc: string | undefined;
  let body: HTMLDivElement | undefined;
  // A publish result is announced as a self-dismissing toast rather than a box
  // the reader must close before the edited section reappears.
  const [toast, setToast] = createSignal<EditResult>();
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function announce(r: EditResult) {
    clearTimeout(toastTimer);
    setToast(r);
    const ms = r.kind === "live" ? 3500 : 9000;
    toastTimer = setTimeout(() => setToast(undefined), ms);
  }
  onCleanup(() => clearTimeout(toastTimer));

  // Render markdown with red links already resolved, so missing-target links
  // paint red on first frame instead of flashing blue until `decorate` runs.
  async function renderResolved(raw: string) {
    const { renderMarkdown, decorateHeadingsHtml, emphasizeLeadHtml, splitTitle } =
      await loadMarkdown();
    const { title, body, meta } = splitTitle(raw);
    const html = emphasizeLeadHtml(
      decorateHeadingsHtml(
        markRedLinksHtml(renderMarkdown(body), await pageSet(), langOf(slug())),
        slug(),
      ),
      title,
    );
    return { title, html: withInfobox(html, meta) as string, meta };
  }

  // Render this page pinned to a historic commit (permalink to a revision).
  async function showRevision(rev: string) {
    try {
      const { html, meta } = await renderResolved(await fetchMarkdownAt(slug(), rev));
      setMeta(meta);
      setHtml(html);
      setRevOf(rev);
      queueMicrotask(decorate);
    } catch (e) {
      setErr(errMessage(e));
    }
  }

  function decorate() {
    if (!body) return;
    void decorateArticle(body, { slug: slug() });
  }

  function render(latest: string, title: string, m: PageMeta, html: string) {
    // One batched update so the title, body, infobox and notices appear in a
    // single paint — never a half-rendered page.
    batch(() => {
      setRaw(latest);
      setMeta(m);
      setHtml(html);
    });
    if (!props.titleOwned) {
      const heading = title || slug();
      document.title = heading;
      const el = document.querySelector(".page-title");
      if (el) el.textContent = heading;
    }
    fillCategorySlot(m.tags);
    queueMicrotask(decorate);
  }

  // On the static read view the footer category chips are a placeholder slot
  // (the build can't know the live tags); fill it from the page we just fetched
  // so the chips match the commit, not the build-time copy. No-op under edge-SSR,
  // where the chips are already server-rendered.
  function fillCategorySlot(tags?: string[]) {
    const slot = document.querySelector<HTMLElement>(".cat-block[data-cats]");
    if (!slot) return;
    const { topical, maintenance } = tags?.length
      ? classifyTags(tags)
      : { topical: [], maintenance: [] };
    const chip = (c: string) =>
      `<a class="chip chip-link" href="${categoryHref(c)}">${escapeText(c)}</a>`;
    const catRow = (label: string, items: string[], extra = "") =>
      items.length
        ? `<div class="cat-row${extra}"><span class="cat-label">${label}</span>${items.map(chip).join("")}</div>`
        : "";
    slot.innerHTML =
      catRow("Categories", topical) +
      catRow("Maintenance", maintenance, " cat-row-maint");
    slot.hidden = slot.innerHTML === "";
  }

  async function revalidate() {
    void loadMarkdown(); // download the renderer alongside the content fetch
    try {
      const latest = await fetchMarkdown(slug());
      const { title, html, meta } = await renderResolved(latest);
      render(latest, title, meta, html);
    } catch (e) {
      // Only the freshly fetched file may be shown: on failure surface an error
      // rather than fall back to the (possibly stale) build-time snapshot.
      if (!props.titleOwned) {
        const el = document.querySelector(".page-title");
        if (el) el.textContent = prettify(slug());
      }
      if (e instanceof PageNotFoundError) setNotFound(true);
      else setErr(errMessage(e));
    }
  }

  // The build-rendered article HTML, baked into a sibling <noscript> (which also
  // gives non-JS crawlers real content). When JS is on, <noscript> children are
  // inert text, so `.textContent` returns the markup string to inject.
  function bakedHtml(): string | undefined {
    return document.getElementById("wiki-baked")?.textContent || undefined;
  }

  // Paint the baked copy directly — no content fetch, no markdown renderer. Red
  // links are re-resolved against the live page set (cheap, no markdown chunk) so
  // a target created since the build doesn't paint stale-coloured.
  async function showBaked(built: string) {
    const live = markRedLinksHtml(built, await pageSet(), langOf(slug()));
    batch(() => {
      setMeta(props.meta ?? {});
      setHtml(withInfobox(live, props.meta));
    });
    if (!props.titleOwned) {
      const heading = props.title || prettify(slug());
      document.title = heading;
      const el = document.querySelector(".page-title");
      if (el) el.textContent = heading;
    }
    fillCategorySlot(props.meta?.tags);
    queueMicrotask(decorate);
  }

  // Decide which copy to show before any content paints. The baked HTML reaches
  // the DOM only when the per-page blob sha proves it current; anything else
  // (stale, unknown, or a failed check) goes straight to the CDN fetch.
  async function load() {
    let current = false;
    try {
      const { versions } = await resolveVersions();
      current = !!props.bakedSha && versions[slug()] === props.bakedSha;
    } catch {
      // Couldn't resolve versions → treat as stale and let revalidate() fetch.
    }
    const built = bakedHtml();
    if (current && built) return void showBaked(built);
    void revalidate();
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectedFrom(params.get("redirectedfrom") ?? undefined);
    const rev = params.get("rev");
    if (rev) return void showRevision(rev); // historical view; skip the latest fetch
    void load();
  });

  // A section `[edit]` opens a focused editor in place rather than navigating
  // to the full-page editor. Intercept only plain left-clicks so middle-click /
  // modified-click and no-JS still follow the baked `/edit?section=` href (the
  // "edit whole page" escape hatch is also linked inside the focused editor).
  function onArticleClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.section-edit");
    if (!link || !body?.contains(link)) return;
    if (revOf()) return; // editing targets the live page, not a historic revision
    const id = new URL(link.href, location.href).searchParams.get("section");
    const heading = link.closest<HTMLElement>("h2, h3");
    if (!id || !heading) return; // nothing to anchor to → let the link navigate
    // We're handling it in-place; parsing the frontmatter needs the lazy chunk.
    e.preventDefault();
    void openSectionEdit(id, heading);
  }

  async function openSectionEdit(id: string, heading: HTMLElement) {
    // A baked page paints without its markdown in hand; fetch it on first edit.
    const doc = raw() ?? (await fetchMarkdown(slug()));
    setRaw(doc);
    const { splitFrontmatter, withFrontmatter } = await loadMarkdown();
    const { data, body: md } = splitFrontmatter(doc);
    const span = findSection(md, id);
    if (!span) return;
    closeSectionEdit();
    const mountEl = document.createElement("div");
    mountEl.className = "section-edit-host";
    heading.insertAdjacentElement("afterend", mountEl);
    setSectionEdit({
      mountEl,
      doc,
      reconstruct: (b) => withFrontmatter(data, b),
      body: md,
      span,
      hidden: hideSection(mountEl),
    });
  }

  function closeSectionEdit() {
    const open = sectionEdit();
    if (!open) return;
    open.mountEl.remove();
    for (const el of open.hidden) el.style.removeProperty("display");
    setSectionEdit(undefined);
    if (publishedDoc) {
      const doc = publishedDoc;
      publishedDoc = undefined;
      void showPublished(doc);
    }
  }

  // Re-render the read view from the document we just published — the bytes are
  // already in hand, so this is instant and never shows stale content.
  async function showPublished(doc: string) {
    try {
      const { title, html, meta } = await renderResolved(doc);
      render(doc, title, meta, html);
    } catch {
      /* a render glitch shouldn't strand the editor — keep the current content */
    }
  }

  return (
    <article class="prose article">
      <Show
        when={!notFound() && !err()}
        fallback={
          <div class="wiki-status">
            <Show when={notFound()} fallback={`Could not load this page: ${err()}`}>
              No page named “{slug()}” yet.{" "}
              <Show when={!props.noCreate}>
                <a href={`${BASE}/edit/${slug()}`}>Create it →</a>
              </Show>
            </Show>
          </div>
        }
      >
        <Show when={revOf()}>
          {(rev) => (
            <div class="notice notice-warn">
              <Icons.Info />
              <span>
                You're viewing an old revision (as of{" "}
                <span class="mono">{rev().slice(0, 7)}</span>
                ). <a href={readHref(slug())}>View the current version</a>.
              </span>
            </div>
          )}
        </Show>
        <Show when={redirectedFrom()}>
          {(from) => (
            <div class="redirect-note">
              Redirected from{" "}
              <a href={`${BASE}/${from()}?redirect=no`}>{prettify(from())}</a>
            </div>
          )}
        </Show>
        <Show when={meta().hatnote}>
          <div class="hatnote">{meta().hatnote}</div>
        </Show>
        <Show when={meta().banner}>
          {(banner) => (
            <div class={`notice notice-${banner().kind ?? "info"}`}>
              <Show when={banner().kind === "warn"} fallback={<Icons.Info />}>
                <Icons.Warn />
              </Show>
              <span>{banner().text}</span>
            </div>
          )}
        </Show>
        <Show when={html()} fallback={<ArticleSkeleton />}>
          <div
            ref={(el) => {
              body = el;
              el.addEventListener("click", onArticleClick);
            }}
            innerHTML={html()}
          />
        </Show>
        <Show when={sectionEdit()}>
          {(s) => (
            <Portal mount={s().mountEl}>
              <Suspense>
                <FocusedEditor
                  slug={slug()}
                  original={s().doc}
                  source={s().body}
                  span={s().span}
                  reconstruct={s().reconstruct}
                  onClose={closeSectionEdit}
                  onPublished={(r, doc) => {
                    if (r.kind === "live") publishedDoc = doc;
                    closeSectionEdit();
                    announce(r);
                  }}
                />
              </Suspense>
            </Portal>
          )}
        </Show>
      </Show>
      <Show when={toast()}>
        {(r) => (
          <Portal mount={document.body}>
            <div class="toast-wrap">
              <ResultToast result={r()} />
            </div>
          </Portal>
        )}
      </Show>
    </article>
  );
}

function ResultToast(props: { result: EditResult }) {
  const kind = () => props.result.kind;
  return (
    <div
      class={kind() === "reverted" ? "toast toast-warn" : "toast"}
      role={kind() === "reverted" ? "alert" : "status"}
      aria-live={kind() === "reverted" ? "assertive" : "polite"}
    >
      <Switch>
        <Match when={kind() === "live"}>
          <Icons.Check />
          <span>Published live.</span>
        </Match>
        <Match when={props.result.kind === "pending" && props.result}>
          {(r) => (
            <>
              <Icons.Info />
              <span>
                Submitted for review —{" "}
                <a href={r().prUrl} target="_blank" rel="noreferrer">
                  track its status
                </a>
                .
              </span>
            </>
          )}
        </Match>
        <Match when={kind() === "reverted"}>
          <Icons.Warn />
          <span>
            Edit reverted as likely vandalism. Re-edit or raise it on the talk page.
          </span>
        </Match>
      </Switch>
    </div>
  );
}

const escapeText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Hide the rendered nodes of a section (mountEl sits just after its heading, so
// its following siblings up to the next h2/h3 are the section body) and return
// them so the editor can restore them on close.
function hideSection(mountEl: HTMLElement): HTMLElement[] {
  const hidden: HTMLElement[] = [];
  let n = mountEl.nextElementSibling;
  while (n && !n.matches("h2, h3")) {
    const next = n.nextElementSibling;
    if (n instanceof HTMLElement) {
      n.style.display = "none";
      hidden.push(n);
    }
    n = next;
  }
  return hidden;
}

function ArticleSkeleton() {
  return (
    <div class="sk-article" aria-hidden="true">
      <div
        class="sk-bar skeleton"
        style={{ height: "2.1rem", width: "55%", "margin-bottom": "0.6rem" }}
      />
      <div class="sk-bar skeleton" style={{ width: "94%" }} />
      <div class="sk-bar skeleton" style={{ width: "89%" }} />
      <div class="sk-bar skeleton" style={{ width: "92%" }} />
      <div class="sk-bar skeleton" style={{ width: "38%" }} />
    </div>
  );
}
