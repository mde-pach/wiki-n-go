import type { APIRoute } from "astro";
import { config } from "../config";
import { computeGraph, type PageNode } from "../lib/linkgraph";
import { splitTitle } from "../lib/markdown";
import { contentSlugs, rawPage } from "../lib/pages";
import { prettify, slugifyTarget } from "../lib/paths";

// Outgoing internal-link targets in a page. Interwiki links (w:/wikipedia:) are
// external, so they're excluded; slugify matches the wikilink renderer.
function extractLinks(raw: string): string[] {
  const slugs = new Set<string>();
  const re = /\[\[([^\]\n]+)\]\]/g;
  let m = re.exec(raw);
  while (m) {
    const target = m[1].split("|")[0].trim();
    if (!/^(?:w|wikipedia):/i.test(target)) {
      const s = slugifyTarget(target);
      if (s) slugs.add(s);
    }
    m = re.exec(raw);
  }
  return [...slugs];
}

// Static link-graph index built from the content glob — emitted once per build,
// fetched by the special pages. No Worker.
export const GET: APIRoute = () => {
  const nodes: PageNode[] = contentSlugs().map((slug) => {
    const raw = rawPage(slug) ?? "";
    const { title, meta } = splitTitle(raw);
    return {
      slug,
      title: title || prettify(slug),
      out: extractLinks(raw),
      redirect: meta.redirect ? slugifyTarget(meta.redirect) : undefined,
    };
  });
  return new Response(JSON.stringify(computeGraph(nodes, config.homeSlug)), {
    headers: { "content-type": "application/json" },
  });
};
