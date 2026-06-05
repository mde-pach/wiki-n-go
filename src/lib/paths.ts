import { config } from "../config";

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type View = "read" | "edit" | "history" | "talk";

export function readHref(slug: string): string {
  return `${BASE}/${slug === config.homeSlug ? "" : slug}`;
}

// Title-case the last path segment for display, e.g. `guides/getting-started`
// → `Getting started`.
export function prettify(slug: string): string {
  const s = slug.split("/").pop() ?? slug;
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Map the current URL to a view + slug. The edit/history/talk prefixes select a
// view; everything else is a read.
export function parseRoute(): { view: View; slug: string } {
  let path = window.location.pathname;
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  for (const v of ["edit", "history", "talk"] as const) {
    if (path === v || path.startsWith(`${v}/`)) {
      return {
        view: v,
        slug: path.slice(v.length).replace(/^\/+/, "") || config.homeSlug,
      };
    }
  }
  return { view: "read", slug: path || config.homeSlug };
}
