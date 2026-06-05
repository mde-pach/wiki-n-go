import { BASE } from "./paths";

export interface PageNode {
  slug: string;
  title: string;
  out: string[]; // outgoing internal-link target slugs (deduped)
}

export interface WantedPage {
  slug: string;
  by: string[];
}

export interface LinkGraph {
  titles: Record<string, string>;
  backlinks: Record<string, string[]>; // existing target slug -> source slugs
  wanted: WantedPage[]; // linked-but-missing targets, busiest first
  orphans: string[]; // existing pages nothing links to (home excluded)
  deadends: string[]; // existing pages with no outgoing internal links
}

// Invert the page→links map into the reports the special pages need. Pure, so
// it's unit-tested and runs the same at build time and in tests.
export function computeGraph(nodes: PageNode[], homeSlug: string): LinkGraph {
  const exists = new Set(nodes.map((n) => n.slug));
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

  const orphans = nodes
    .filter((n) => n.slug !== homeSlug && !backlinks[n.slug]?.length)
    .map((n) => n.slug)
    .sort();
  const deadends = nodes
    .filter((n) => !n.out.some((t) => exists.has(t)))
    .map((n) => n.slug)
    .sort();
  const wanted = Object.entries(wantedMap)
    .map(([slug, by]) => ({ slug, by: by.sort() }))
    .sort((a, b) => b.by.length - a.by.length || a.slug.localeCompare(b.slug));

  return { titles, backlinks, wanted, orphans, deadends };
}

let cache: Promise<LinkGraph | null> | undefined;

// The static index emitted at build (link-graph.json). Fetched once; null if it
// can't be loaded so the special pages degrade gracefully.
export function getLinkGraph(): Promise<LinkGraph | null> {
  if (!cache) {
    cache = fetch(`${BASE}/link-graph.json`)
      .then((res) => (res.ok ? (res.json() as Promise<LinkGraph>) : null))
      .catch(() => null);
  }
  return cache;
}
