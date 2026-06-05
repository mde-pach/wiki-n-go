// Pure link-graph + search-index logic, mirroring src/lib/{linkgraph,search,paths}
// in the app. Duplicated rather than imported because the Worker is a separate
// bundle and the app libs pull in Astro/Vite-only APIs. Keep the two in sync.

export interface IndexNode {
  title: string;
  out: string[]; // outgoing internal-link target slugs
  redirect?: string; // target slug if this page is a redirect
  text: string; // plain-text body for search
}
export type IndexMap = Record<string, IndexNode>;

export interface PageNode {
  slug: string;
  title: string;
  out: string[];
  redirect?: string;
}
export interface WantedPage {
  slug: string;
  by: string[];
}
export interface Redirect {
  from: string;
  to: string;
  broken: boolean;
  double: boolean;
}
export interface LinkGraph {
  titles: Record<string, string>;
  backlinks: Record<string, string[]>;
  wanted: WantedPage[];
  orphans: string[];
  deadends: string[];
  redirects: Redirect[];
}

export function slugifyTarget(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function prettify(slug: string): string {
  const s = slug.split("/").pop() ?? slug;
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function extractLinks(raw: string): string[] {
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

export function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]:?/g, " ")
    .replace(/^\s{0,3}[>#\-*+]\s+/gm, " ")
    .replace(/[*_~>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build one page's index entry from its raw markdown. `redirect` is resolved by
// the caller (which has the parsed frontmatter).
export function buildNode(slug: string, raw: string, redirect?: string): IndexNode {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return {
    title: m ? m[1].trim() : prettify(slug),
    out: extractLinks(body),
    redirect: redirect || undefined,
    text: toPlainText(body),
  };
}

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

// Project the stored map into the two response shapes.
export function graphFromMap(map: IndexMap, homeSlug: string): LinkGraph {
  const nodes: PageNode[] = Object.entries(map).map(([slug, n]) => ({
    slug,
    title: n.title,
    out: n.out,
    redirect: n.redirect,
  }));
  return computeGraph(nodes, homeSlug);
}

export function searchDocsFromMap(
  map: IndexMap,
): { slug: string; title: string; text: string }[] {
  return Object.entries(map).map(([slug, n]) => ({
    slug,
    title: n.title,
    text: n.text,
  }));
}
