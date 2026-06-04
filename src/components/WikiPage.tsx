import { createEffect, createResource, ErrorBoundary, Suspense } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { pageSet } from "../lib/manifest";
import { slugFromLocation } from "../lib/slug";

export default function WikiPage(props: { slug?: string }) {
  const slug = () => props.slug ?? slugFromLocation();
  const [html] = createResource(slug, async (s) =>
    renderMarkdown(await fetchMarkdown(s)),
  );

  let body: HTMLDivElement | undefined;
  createEffect(() => {
    if (html() && body) {
      markRedLinks(body);
      document.dispatchEvent(new CustomEvent("wiki:rendered"));
    }
  });

  return (
    <article class="prose">
      <ErrorBoundary
        fallback={(err) => (
          <div class="wiki-status">
            {err instanceof PageNotFoundError
              ? `No page named “${slug()}” yet.`
              : `Could not load this page: ${err?.message ?? String(err)}`}
          </div>
        )}
      >
        <Suspense fallback={<p class="wiki-status">Loading…</p>}>
          <div
            ref={(el) => {
              body = el;
            }}
            innerHTML={html()}
          />
        </Suspense>
      </ErrorBoundary>
    </article>
  );
}

async function markRedLinks(root: HTMLElement): Promise<void> {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-slug]");
  if (links.length === 0) return;
  const pages = await pageSet();
  for (const a of links) {
    const slug = a.dataset.slug;
    if (slug && !pages.has(slug)) {
      a.classList.add("red");
      a.title = "Page does not exist yet — click to create";
    }
  }
}
