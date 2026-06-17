import { batch, createSignal, lazy, onMount, Show, Suspense } from "solid-js";
import { Portal } from "solid-js/web";
import { classifyTags } from "../lib/categories";
import { fetchMarkdown, fetchMarkdownAt, PageNotFoundError } from "../lib/content";
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
// on the read path, yet it's only needed to client-render a page: never on the
// edge-SSR path (the server already rendered `initialHtml`), and on the static
// path it loads in parallel with the content fetch. Keep it out of the island's
// hydration chunk and pull it on demand. Memoized so it downloads once.
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
  initialHtml?: string;
  initialRaw?: string;
  meta?: PageMeta;
  // A profile page only the owner/maintainer may create → suppress the "Create
  // it →" invite for everyone else (they'd be refused anyway).
  noCreate?: boolean;
  // Edge-SSR: initialHtml/initialRaw were fetched at request time, so skip the
  // on-mount refetch (no double-fetch). The static path leaves this off and
  // refetches the latest so a no-rebuild content edit shows without a deploy.
  fresh?: boolean;
  // Edge-SSR resolved that this slug has no page, so render the "not found"
  // state server-side (the static path never renders a missing page here).
  missing?: boolean;
}) {
  const slug = () => props.slug ?? slugFromLocation();
  // Bake the quick-facts card in as the article's first child so it floats
  // inside the prose flow (text wraps around it instead of sliding under it).
  const withInfobox = (h: string | undefined, m: PageMeta | undefined) =>
    h === undefined ? h : infoboxHtml(slug(), m ?? {}) + h;
  // Only show server-rendered content when it was fetched at request time
  // (edge-SSR, `fresh`). On the static (GitHub Pages) build the baked snapshot
  // can be stale — a no-rebuild content edit isn't in it — so start empty and
  // render solely from the commit the client fetches on mount, all at once.
  const [html, setHtml] = createSignal(
    props.fresh ? withInfobox(props.initialHtml, props.meta) : undefined,
  );
  const [meta, setMeta] = createSignal<PageMeta>(props.fresh ? (props.meta ?? {}) : {});
  const [notFound, setNotFound] = createSignal(props.missing ?? false);
  const [err, setErr] = createSignal<string>();
  const [redirectedFrom, setRedirectedFrom] = createSignal<string>();
  const [revOf, setRevOf] = createSignal<string>();
  // The latest raw markdown in hand, so a section `[edit]` can slice it without
  // a refetch. Tracks the SSR content first, then whatever the client fetches.
  const [raw, setRaw] = createSignal(props.fresh ? props.initialRaw : undefined);
  const [sectionEdit, setSectionEdit] = createSignal<SectionEdit>();
  // The exact document a live publish just committed. We render it straight from
  // hand on close — no refetch, so no waiting on the Worker's cached `/latest`
  // (or the CDN) to catch up to a commit we already hold.
  let publishedDoc: string | undefined;
  let body: HTMLDivElement | undefined;

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
    const heading = title || slug();
    document.title = heading;
    const el = document.querySelector(".page-title");
    if (el) el.textContent = heading;
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
      const el = document.querySelector(".page-title");
      if (el) el.textContent = prettify(slug());
      if (e instanceof PageNotFoundError) setNotFound(true);
      else setErr(errMessage(e));
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectedFrom(params.get("redirectedfrom") ?? undefined);
    if (html()) decorate(); // edge-SSR painted request-time-fresh content already
    const rev = params.get("rev");
    if (rev) return void showRevision(rev); // historical view; skip the latest fetch
    if (props.fresh) return; // edge-SSR already rendered the fresh file
    // Static build: the baked snapshot is never shown (the signals start empty
    // when not fresh), so fetch the latest commit now and render only that — all
    // at once. A fetch failure becomes an error, not stale content.
    void revalidate();
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
    const doc = raw();
    const heading = link.closest<HTMLElement>("h2, h3");
    if (!id || !doc || !heading) return; // nothing in hand → let the link navigate
    // We're handling it in-place; parsing the frontmatter needs the lazy chunk.
    e.preventDefault();
    void openSectionEdit(doc, id, heading);
  }

  async function openSectionEdit(doc: string, id: string, heading: HTMLElement) {
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
                  }}
                />
              </Suspense>
            </Portal>
          )}
        </Show>
      </Show>
    </article>
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
