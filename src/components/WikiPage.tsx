import { createSignal, onMount, Show } from "solid-js";
import { fetchMarkdown, fetchMarkdownAt, PageNotFoundError } from "../lib/content";
import { decorate as decorateArticle } from "../lib/decorate";
import type { PageMeta } from "../lib/frontmatter";
import { pageSet } from "../lib/manifest";
import { emphasizeLeadHtml, renderMarkdown, splitTitle } from "../lib/markdown";
import { BASE, langOf, prettify, readHref, slugFromLocation } from "../lib/paths";
import { errMessage } from "../lib/util";
import { markRedLinksHtml } from "../lib/wikilink";
import { Icons } from "./Icons";

export default function WikiPage(props: {
  slug?: string;
  initialHtml?: string;
  initialRaw?: string;
  meta?: PageMeta;
}) {
  const slug = () => props.slug ?? slugFromLocation();
  const [html, setHtml] = createSignal(props.initialHtml);
  const [meta, setMeta] = createSignal<PageMeta>(props.meta ?? {});
  const [notFound, setNotFound] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [redirectedFrom, setRedirectedFrom] = createSignal<string>();
  const [revOf, setRevOf] = createSignal<string>();
  let body: HTMLDivElement | undefined;

  // Render markdown with red links already resolved, so missing-target links
  // paint red on first frame instead of flashing blue until `decorate` runs.
  async function renderResolved(raw: string) {
    const { title, body, meta } = splitTitle(raw);
    const html = emphasizeLeadHtml(
      markRedLinksHtml(renderMarkdown(body), await pageSet(), langOf(slug())),
      title,
    );
    return { title, html, meta };
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

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    setRedirectedFrom(params.get("redirectedfrom") ?? undefined);
    if (html()) decorate(); // server-rendered content: build the TOC + red links now
    const rev = params.get("rev");
    if (rev) return showRevision(rev); // historical view; skip the latest fetch
    try {
      const raw = await fetchMarkdown(slug());
      if (raw === props.initialRaw) return; // unchanged since build → keep SSR content (no shift)
      const { title, html, meta } = await renderResolved(raw);
      setMeta(meta);
      setHtml(html);
      const heading = title || slug();
      document.title = heading;
      const el = document.querySelector(".page-title");
      if (el) el.textContent = heading;
      queueMicrotask(decorate);
    } catch (e) {
      if (props.initialHtml) return; // page existed at build; keep it on a transient error
      if (e instanceof PageNotFoundError) setNotFound(true);
      else setErr(errMessage(e));
    }
  });

  return (
    <article class="prose article">
      <Show
        when={!notFound() && !err()}
        fallback={
          <div class="wiki-status">
            <Show when={notFound()} fallback={`Could not load this page: ${err()}`}>
              No page named “{slug()}” yet.{" "}
              <a href={`${BASE}/edit/${slug()}`}>Create it →</a>
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
            }}
            innerHTML={html()}
          />
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
