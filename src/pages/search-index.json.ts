import type { APIRoute } from "astro";
import { splitTitle } from "../lib/markdown";
import { contentSlugs, rawPage } from "../lib/pages";
import { prettify } from "../lib/paths";
import { type SearchDoc, toPlainText } from "../lib/search";

// Static full-text index built from the content glob — emitted once at build,
// fetched by the search box. No Worker, no rebuild-on-content (the index is
// only the search corpus, regenerated whenever the site is built).
export const GET: APIRoute = () => {
  const docs: SearchDoc[] = contentSlugs().map((slug) => {
    const { title, body } = splitTitle(rawPage(slug) ?? "");
    return { slug, title: title || prettify(slug), text: toPlainText(body) };
  });
  return new Response(JSON.stringify({ docs }), {
    headers: { "content-type": "application/json" },
  });
};
