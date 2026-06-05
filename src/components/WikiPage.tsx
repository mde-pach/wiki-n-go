import { createEffect, createResource, ErrorBoundary, Show, Suspense } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { pageSet } from "../lib/manifest";
import { slugFromLocation } from "../lib/slug";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WikiPage(props: { slug?: string }) {
  const slug = () => props.slug ?? slugFromLocation();
  const [page] = createResource(slug, async (s) => {
    const raw = await fetchMarkdown(s);
    const m = raw.match(/^#\s+(.+?)\s*$/m);
    const body = m ? raw.replace(m[0], "").trimStart() : raw;
    return { title: m ? m[1] : s, html: renderMarkdown(body) };
  });

  let body: HTMLDivElement | undefined;
  createEffect(() => {
    const p = page();
    if (!p) return;
    // The page title lives in the static chrome; fill it once content resolves.
    document.title = p.title;
    const titleEl = document.querySelector(".page-title");
    if (titleEl) titleEl.textContent = p.title;
    if (body) {
      markRedLinks(body);
      document.dispatchEvent(new CustomEvent("wiki:rendered"));
    }
  });

  return (
    <article class="prose article">
      <ErrorBoundary
        fallback={(err) => (
          <div class="wiki-status">
            <Show
              when={err instanceof PageNotFoundError}
              fallback={`Could not load this page: ${err?.message ?? String(err)}`}
            >
              No page named “{slug()}” yet.{" "}
              <a href={`${BASE}/edit/${slug()}`}>Create it →</a>
            </Show>
          </div>
        )}
      >
        <Suspense fallback={<ArticleSkeleton />}>
          <div
            ref={(el) => {
              body = el;
            }}
            innerHTML={page()?.html}
          />
        </Suspense>
      </ErrorBoundary>
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
