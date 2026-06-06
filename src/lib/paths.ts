import { config } from "../config";

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type View = "read" | "edit" | "history" | "talk";

export function readHref(slug: string): string {
  if (slug === config.homeSlug) return `${BASE}/`;
  return `${BASE}/${isLangHome(slug) ?? slug}`;
}

// Non-default language codes are the reserved slug prefixes (M8): the default
// language is languageless, so a leading non-default code marks a translation.
const PREFIX_LANGS = new Set(
  config.languages.map((l) => l.code).filter((c) => c !== config.defaultLang),
);

// The language of a page from its slug: a leading non-default code, else default.
export function langOf(slug: string): string {
  const seg = slug.split("/")[0];
  return PREFIX_LANGS.has(seg) ? seg : config.defaultLang;
}

// `<lang>/index` is that language's home, served at `/<lang>` (mirrors the
// default home at `/`). Returns the language code, or null if not a lang home.
export function isLangHome(slug: string): string | null {
  const parts = slug.split("/");
  return parts.length === 2 && parts[1] === "index" && PREFIX_LANGS.has(parts[0])
    ? parts[0]
    : null;
}

// Map a read-route param to its content slug: `/` → home, `/<lang>` → that
// language's home (`<lang>/index`), everything else verbatim.
export function contentSlugForRoute(routeSlug: string | undefined): string {
  if (!routeSlug) return config.homeSlug;
  return PREFIX_LANGS.has(routeSlug) ? `${routeSlug}/index` : routeSlug;
}

// Resolve a wikilink target for the *reading* language (M8). On a non-default
// page, prefer the same-language article; fall back to the default-language one;
// otherwise it's a red link to create in the reading language.
export function resolveWikiSlug(
  base: string,
  exists: Set<string>,
  lang: string,
): { slug: string; red: boolean } {
  if (lang !== config.defaultLang) {
    const local = `${lang}/${base}`;
    if (exists.has(local)) return { slug: local, red: false };
    if (exists.has(base)) return { slug: base, red: false };
    return { slug: local, red: true };
  }
  return { slug: base, red: !exists.has(base) };
}

// Title-case the last path segment for display, e.g. `guides/getting-started`
// → `Getting started`.
export function prettify(slug: string): string {
  const s = slug.split("/").pop() ?? slug;
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Slug for a label/tag/heading (e.g. "Wiki software" → "wiki-software"): drops
// `/`, so it never spans path segments.
export function slugifyLabel(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

// Slug for a page reference (wikilink / redirect target / search query): keeps
// `/` for nested paths, matching how content files are keyed.
export function slugifyPath(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function categoryHref(tag: string): string {
  return `${BASE}/category/${slugifyLabel(tag)}`;
}

export const changesHref = `${BASE}/changes`;
export const reviewHref = `${BASE}/review`;
export const adminHref = `${BASE}/admin`;

// Map the current URL to a view + slug. The edit/history/talk/category/changes/
// review prefixes select a view; everything else is a read.
export function parseRoute(): {
  view: View | "category" | "changes" | "review";
  slug: string;
} {
  let path = window.location.pathname;
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "changes") return { view: "changes", slug: "" };
  if (path === "review") return { view: "review", slug: "" };
  for (const v of ["edit", "history", "talk", "category"] as const) {
    if (path === v || path.startsWith(`${v}/`)) {
      return {
        view: v,
        slug:
          path.slice(v.length).replace(/^\/+/, "") ||
          (v === "category" ? "" : config.homeSlug),
      };
    }
  }
  return { view: "read", slug: contentSlugForRoute(path || undefined) };
}

export function slugFromLocation(): string {
  return parseRoute().slug;
}
