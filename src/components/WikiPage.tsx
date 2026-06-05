import { createSignal, onMount, Show } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { pageSet } from "../lib/manifest";
import { splitTitle } from "../lib/markdown";
import { BASE } from "../lib/paths";
import { slugFromLocation } from "../lib/slug";
import { errMessage } from "../lib/util";

export default function WikiPage(props: {
  slug?: string;
  initialHtml?: string;
  initialRaw?: string;
}) {
  const slug = () => props.slug ?? slugFromLocation();
  const [html, setHtml] = createSignal(props.initialHtml);
  const [notFound, setNotFound] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  let body: HTMLDivElement | undefined;

  async function decorate() {
    if (!body) return;
    await markRedLinks(body);
    document.dispatchEvent(new CustomEvent("wiki:rendered"));
  }

  onMount(async () => {
    if (html()) decorate(); // server-rendered content: build the TOC + red links now
    try {
      const raw = await fetchMarkdown(slug());
      if (raw === props.initialRaw) return; // unchanged since build → keep SSR content (no shift)
      const { title, body } = splitTitle(raw);
      setHtml(renderMarkdown(body));
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

async function markRedLinks(root: HTMLElement): Promise<void> {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-slug]");
  if (links.length === 0) return;
  const pages = await pageSet();
  for (const a of links) {
    const slug = a.dataset.slug;
    if (slug && !pages.has(slug)) {
      a.classList.add("is-red");
      a.title = "Page does not exist yet — click to create";
    }
  }
}
