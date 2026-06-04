import { createResource, ErrorBoundary, Suspense } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { slugFromLocation } from "../lib/slug";

export default function WikiPage(props: { slug?: string }) {
  const slug = () => props.slug ?? slugFromLocation();
  const [html] = createResource(slug, async (s) =>
    renderMarkdown(await fetchMarkdown(s)),
  );

  return (
    <article class="wiki-content">
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
          <div innerHTML={html()} />
        </Suspense>
      </ErrorBoundary>
    </article>
  );
}
