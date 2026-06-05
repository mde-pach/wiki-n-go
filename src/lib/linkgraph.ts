import { config } from "../config";
import { BASE } from "./paths";

export interface PageNode {
  slug: string;
  title: string;
  out: string[]; // outgoing internal-link target slugs (deduped)
  redirect?: string; // target slug if this page is a redirect
}

export interface WantedPage {
  slug: string;
  by: string[];
}

export interface Redirect {
  from: string;
  to: string;
  broken: boolean; // target doesn't exist
  double: boolean; // target is itself a redirect
}

export interface LinkGraph {
  titles: Record<string, string>;
  backlinks: Record<string, string[]>; // existing target slug -> source slugs
  wanted: WantedPage[]; // linked-but-missing targets, busiest first
  orphans: string[]; // existing pages nothing links to (home excluded)
  deadends: string[]; // existing pages with no outgoing internal links
  redirects: Redirect[]; // all redirects, flagged broken/double
}

// Invert the page→links map into the reports the special pages need. Pure, so
// it's unit-tested and runs the same at build time and in tests.
export function computeGraph(nodes: PageNode[], homeSlug: string): LinkGraph {
  const exists = new Set(nodes.map((n) => n.slug));
  const isRedirect = new Set(nodes.filter((n) => n.redirect).map((n) => n.slug));
  const titles: Record<string, string> = {};
  const backlinks: Record<string, string[]> = {};
  const wantedMap: Record<string, string[]> = {};

  for (const n of nodes) {
    titles[n.slug] = n.title;
    for (const tgt of n.out) {
      if (tgt === n.slug) continue;
      const map = exists.has(tgt) ? backlinks : wantedMap;
      if (!map[tgt]) map[tgt] = [];
      map[tgt].push(n.slug);
    }
  }

  // Redirect pages aren't real content, so keep them out of the orphan/dead-end
  // reports.
  const content = nodes.filter((n) => !isRedirect.has(n.slug));
  const orphans = content
    .filter((n) => n.slug !== homeSlug && !backlinks[n.slug]?.length)
    .map((n) => n.slug)
    .sort();
  const deadends = content
    .filter((n) => !n.out.some((t) => exists.has(t)))
    .map((n) => n.slug)
    .sort();
  const wanted = Object.entries(wantedMap)
    .map(([slug, by]) => ({ slug, by: by.sort() }))
    .sort((a, b) => b.by.length - a.by.length || a.slug.localeCompare(b.slug));
  const redirects: Redirect[] = nodes
    .filter((n) => n.redirect)
    .map((n) => ({
      from: n.slug,
      to: n.redirect as string,
      broken: !exists.has(n.redirect as string),
      double: isRedirect.has(n.redirect as string),
    }))
    .sort((a, b) => a.from.localeCompare(b.from));

  return { titles, backlinks, wanted, orphans, deadends, redirects };
}

let cache: Promise<LinkGraph | null> | undefined;

// Prefer the Worker's live index (fresh on every edit, no rebuild); fall back to
// the static build file when there's no Worker / it's unreachable. Fetched once.
async function load(): Promise<LinkGraph | null> {
  for (const url of [
    config.workerUrl ? `${config.workerUrl}/link-graph` : null,
    `${BASE}/link-graph.json`,
  ]) {
    if (!url) continue;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return (await res.json()) as LinkGraph;
    } catch {
      // try the next source
    }
  }
  return null;
}

export function getLinkGraph(): Promise<LinkGraph | null> {
  if (!cache) cache = load();
  return cache;
}
