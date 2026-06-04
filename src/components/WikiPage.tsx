import { createResource, ErrorBoundary, Suspense } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";

// Used by the 404 fallback, where no slug prop is passed.
function slugFromLocation(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return path || "index";
}

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
