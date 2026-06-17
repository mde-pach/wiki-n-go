import { prettify, slugifyLabel } from "./paths";

// A category is identified by its slugified tag (matching `categoryHref`), so the
// `/category/<tag>` URL, the chips, and the index keys all line up.

// The category a content page "backs": the slugified last segment of its slug.
// Page `film` (or `arts/film`) is the description page for category `film`, and
// its own tags are that category's parents — this is how a tagged category page
// becomes a subcategory of the categories it carries.
export function catKeyOf(slug: string): string {
  return slugifyLabel(slug.split("/").pop() ?? slug);
}

// Maintenance/"hidden" categories track cleanup workflows (stubs, citations
// needed, …) and Wikipedia keeps them out of the topical listing. We classify by
// reserved name: a `maintenance`/`cleanup` namespace prefix, or a built-in set of
// the common cleanup tags.
const MAINTENANCE_TAGS = new Set([
  "stub",
  "stubs",
  "cleanup",
  "wikify",
  "orphan",
  "orphaned",
  "uncategorized",
  "needs-citation",
  "needs-citations",
  "citation-needed",
  "disputed",
  "outdated",
  "merge",
  "to-merge",
  "split",
  "delete",
  "expand",
  "copyedit",
  "maintenance",
]);

export function isMaintenanceCategory(catSlug: string): boolean {
  return (
    catSlug.startsWith("maintenance-") ||
    catSlug.startsWith("cleanup-") ||
    MAINTENANCE_TAGS.has(catSlug)
  );
}

// Split a page's raw tag strings into the two rows the chrome renders separately,
// preserving the original display text and de-duplicating by slug.
export function classifyTags(tags: string[]): {
  topical: string[];
  maintenance: string[];
} {
  const seen = new Set<string>();
  const topical: string[] = [];
  const maintenance: string[] = [];
  for (const tag of tags) {
    const slug = slugifyLabel(tag);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    (isMaintenanceCategory(slug) ? maintenance : topical).push(tag);
  }
  return { topical, maintenance };
}

// Parse a `/category/<slug>` path into the requested tag slugs. `a+b` is a boolean
// intersection (pages in all of them); `+` is safe as the separator because
// `slugifyLabel` strips it, so no single tag ever contains one.
export function parseCategoryQuery(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split("+")) {
    const slug = slugifyLabel(part);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      tags.push(slug);
    }
  }
  return tags;
}

// Pages carrying every requested tag (intersection; a single tag is its own
// member list). The per-tag lists come pre-deduped from the index.
export function intersectMembers(
  categories: Record<string, string[]>,
  request: string[],
): string[] {
  if (!request.length) return [];
  const lists = request.map((t) => categories[t] ?? []);
  const [first, ...rest] = lists;
  const sets = rest.map((list) => new Set(list));
  return first.filter((slug) => sets.every((s) => s.has(slug)));
}

export interface CatMember {
  slug: string;
  title: string;
  cat?: string; // set when the member is itself a category (a subcategory)
  count?: number; // member count, for subcategories
}

export interface CatGroup {
  tags: string[]; // requested tag slugs
  intersection: boolean;
  maintenance: boolean; // the requested category is itself a maintenance one
  subcategories: CatMember[]; // members that are themselves category pages
  pages: CatMember[]; // plain member pages
  parents: string[]; // parent category slugs (single-tag mode only)
  total: number;
}

type GraphSlice = {
  categories: Record<string, string[]>;
  titles: Record<string, string>;
};

// Group a category's members for display: split member pages that are themselves
// categories into a Subcategories section (Wikipedia-style hierarchy), find the
// category's own parent categories, and flag maintenance categories.
export function groupCategory(g: GraphSlice, request: string[]): CatGroup {
  const { categories, titles } = g;
  const title = (slug: string) => titles[slug] ?? prettify(slug);
  const members = intersectMembers(categories, request);
  const requested = new Set(request);

  const subcategories: CatMember[] = [];
  const pages: CatMember[] = [];
  for (const slug of members) {
    const cat = catKeyOf(slug);
    if (!requested.has(cat) && categories[cat]?.length) {
      subcategories.push({
        slug,
        title: title(slug),
        cat,
        count: categories[cat].length,
      });
    } else {
      pages.push({ slug, title: title(slug) });
    }
  }
  const byTitle = (a: CatMember, b: CatMember) => a.title.localeCompare(b.title);
  subcategories.sort(byTitle);
  pages.sort(byTitle);

  let parents: string[] = [];
  if (request.length === 1) {
    const cat = request[0];
    const backing = Object.keys(titles)
      .sort()
      .find((slug) => catKeyOf(slug) === cat);
    if (backing) {
      parents = Object.keys(categories)
        .filter((t) => t !== cat && categories[t].includes(backing))
        .sort();
    }
  }

  return {
    tags: request,
    intersection: request.length > 1,
    maintenance: request.length === 1 && isMaintenanceCategory(request[0]),
    subcategories,
    pages,
    parents,
    total: members.length,
  };
}

// All categories in the graph, split topical vs maintenance, each with its member
// count — powers the Special "All categories" report.
export interface CatSummary {
  slug: string;
  count: number;
}
export function allCategories(categories: Record<string, string[]>): {
  topical: CatSummary[];
  maintenance: CatSummary[];
} {
  const topical: CatSummary[] = [];
  const maintenance: CatSummary[] = [];
  for (const slug of Object.keys(categories).sort()) {
    const entry = { slug, count: categories[slug].length };
    (isMaintenanceCategory(slug) ? maintenance : topical).push(entry);
  }
  return { topical, maintenance };
}
