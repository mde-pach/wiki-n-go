import { config } from "../config";
import { engineUrl } from "./engine";
import { fetchFirstOk } from "./net";
import { BASE, slugifyLabel } from "./paths";
import { bootTenant } from "./tenant";

export interface PageNode {
  slug: string;
  title: string;
  out: string[]; // outgoing internal-link target slugs (deduped)
  redirect?: string; // target slug if this page is a redirect
  translationKey?: string; // shared id grouping this page's translations (M8)
  tags?: string[]; // category tags carried in frontmatter (M7)
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
  translations: Record<string, string[]>; // translationKey -> sibling slugs (M8)
  categories: Record<string, string[]>; // slugified tag -> member slugs (M7)
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

  const translations: Record<string, string[]> = {};
  for (const n of nodes) {
    const k = n.translationKey;
    if (!k) continue;
    if (!translations[k]) translations[k] = [];
    translations[k].push(n.slug);
  }

  const categories = invertTags(nodes);

  return {
    titles,
    backlinks,
    wanted,
    orphans,
    deadends,
    redirects,
    translations,
    categories,
  };
}

// Invert page→tags into category→members. Keys are slugified tags (matching
// `categoryHref`), each member list deduped and sorted so it's stable to diff.
function invertTags(nodes: PageNode[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const n of nodes) {
    for (const tag of n.tags ?? []) {
      const key = slugifyLabel(tag);
      if (!key) continue;
      if (!map[key]) map[key] = new Set();
      map[key].add(n.slug);
    }
  }
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(map)) out[key] = [...map[key]].sort();
  return out;
}

export interface GraphStats {
  pages: number; // content pages (redirects excluded)
  redirects: number;
  links: number; // internal links (resolved + wanted)
  wanted: number;
  orphans: number;
  deadends: number;
}

export function graphStats(g: LinkGraph): GraphStats {
  const redirects = g.redirects.length;
  const resolved = Object.values(g.backlinks).reduce((n, a) => n + a.length, 0);
  const wantedLinks = g.wanted.reduce((n, w) => n + w.by.length, 0);
  return {
    pages: Object.keys(g.titles).length - redirects,
    redirects,
    links: resolved + wantedLinks,
    wanted: g.wanted.length,
    orphans: g.orphans.length,
    deadends: g.deadends.length,
  };
}

export function mostLinked(
  g: LinkGraph,
  limit = 50,
): { slug: string; count: number }[] {
  return Object.keys(g.backlinks)
    .map((slug) => ({ slug, count: g.backlinks[slug].length }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

let cache: Promise<LinkGraph | null> | undefined;

// Prefer the Worker's live index (fresh on every edit, no rebuild); fall back to
// the static build file when there's no Worker / it's unreachable. Fetched once.
async function load(): Promise<LinkGraph | null> {
  await bootTenant();
  return fetchFirstOk<LinkGraph>([
    config.workerUrl ? engineUrl("/link-graph") : null,
    `${BASE}/link-graph.json`,
  ]);
}

export function getLinkGraph(): Promise<LinkGraph | null> {
  if (!cache) cache = load();
  return cache;
}
