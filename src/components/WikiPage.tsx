import { createSignal, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { fetchMarkdown, fetchMarkdownAt, PageNotFoundError } from "../lib/content";
import { decorate as decorateArticle } from "../lib/decorate";
import { findSection, type SectionSpan } from "../lib/editor-section";
import { type PageMeta, splitFrontmatter, withFrontmatter } from "../lib/frontmatter";
import { infoboxHtml } from "../lib/infobox";
import { pageSet } from "../lib/manifest";
import {
  decorateHeadingsHtml,
  emphasizeLeadHtml,
  renderMarkdown,
  splitTitle,
} from "../lib/markdown";
import { BASE, langOf, prettify, readHref, slugFromLocation } from "../lib/paths";
import { errMessage } from "../lib/util";
import { markRedLinksHtml } from "../lib/wikilink";
import FocusedEditor from "./editor/FocusedEditor";
import { Icons } from "./Icons";

// A section `[edit]` that's been opened in place: the editor is portaled into
// `mountEl` (inserted right after the heading) so it edits the section without
// leaving the read page.
interface SectionEdit {
  mountEl: HTMLElement;
  doc: string;
  data: Record<string, unknown>;
  body: string;
  span: SectionSpan;
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
  const [html, setHtml] = createSignal(withInfobox(props.initialHtml, props.meta));
  const [meta, setMeta] = createSignal<PageMeta>(props.meta ?? {});
  const [notFound, setNotFound] = createSignal(props.missing ?? false);
  const [err, setErr] = createSignal<string>();
  const [redirectedFrom, setRedirectedFrom] = createSignal<string>();
  const [revOf, setRevOf] = createSignal<string>();
  // The latest raw markdown in hand, so a section `[edit]` can slice it without
  // a refetch. Tracks the SSR content first, then whatever the client fetches.
  const [raw, setRaw] = createSignal(props.initialRaw);
  const [sectionEdit, setSectionEdit] = createSignal<SectionEdit>();
  let reloadAfterEdit = false;
  let body: HTMLDivElement | undefined;

  // Render markdown with red links already resolved, so missing-target links
  // paint red on first frame instead of flashing blue until `decorate` runs.
  async function renderResolved(raw: string) {
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
    setRaw(latest);
    setMeta(m);
    setHtml(html);
    const heading = title || slug();
    document.title = heading;
    const el = document.querySelector(".page-title");
    if (el) el.textContent = heading;
    queueMicrotask(decorate);
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    setRedirectedFrom(params.get("redirectedfrom") ?? undefined);
    if (html()) decorate(); // server-rendered content: build the TOC + red links now
    const rev = params.get("rev");
    if (rev) return showRevision(rev); // historical view; skip the latest fetch
    if (props.fresh) return; // SSR rendered request-time-fresh content already
    try {
      const latest = await fetchMarkdown(slug());
      setRaw(latest);
      if (latest === props.initialRaw) return; // unchanged since build → keep SSR content (no shift)
      const { title, html, meta } = await renderResolved(latest);
      render(latest, title, meta, html);
    } catch (e) {
      if (props.initialHtml) return; // page existed at build; keep it on a transient error
      if (e instanceof PageNotFoundError) setNotFound(true);
      else setErr(errMessage(e));
    }
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
    if (!id || !doc) return; // nothing in hand → let the link navigate to /edit
    const { data, body: md } = splitFrontmatter(doc);
    const span = findSection(md, id);
    const heading = link.closest<HTMLElement>("h2, h3");
    if (!span || !heading) return;
    e.preventDefault();
    closeSectionEdit();
    const mountEl = document.createElement("div");
    mountEl.className = "section-edit-host";
    heading.insertAdjacentElement("afterend", mountEl);
    setSectionEdit({ mountEl, doc, data, body: md, span });
  }

  function closeSectionEdit() {
    const open = sectionEdit();
    if (!open) return;
    open.mountEl.remove();
    setSectionEdit(undefined);
    if (reloadAfterEdit) {
      reloadAfterEdit = false;
      void loadLatest();
    }
  }

  // After a live section publish, pull the fresh page so the read view reflects
  // it (no rebuild — same fetch path as mount, minus the unchanged short-circuit).
  async function loadLatest() {
    try {
      const latest = await fetchMarkdown(slug());
      const { title, html, meta } = await renderResolved(latest);
      render(latest, title, meta, html);
    } catch {
      /* transient — keep the current content */
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
              <FocusedEditor
                slug={slug()}
                original={s().doc}
                source={s().body}
                span={s().span}
                reconstruct={(b) => withFrontmatter(s().data, b)}
                onClose={closeSectionEdit}
                onPublished={(r) => {
                  if (r.live) reloadAfterEdit = true;
                }}
              />
            </Portal>
          )}
        </Show>
      </Show>
    </article>
  );
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
