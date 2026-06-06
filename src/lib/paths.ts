import { config } from "../config";

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type View = "read" | "edit" | "history" | "talk";

export function readHref(slug: string): string {
  return `${BASE}/${slug === config.homeSlug ? "" : slug}`;
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
  return { view: "read", slug: path || config.homeSlug };
}

export function slugFromLocation(): string {
  return parseRoute().slug;
}
