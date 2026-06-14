import type { AppearanceDefaults } from "../config";
import type { SiteConfig } from "./site-config";

// Runtime per-tenant chrome. One static build serves every `foo.wikigit.org`, so
// the header wordmark, tagline and Appearance defaults are baked generic and
// corrected here once the tenant's `wikigit.json` loads. The flagship (config ==
// defaults) is left untouched, keeping its hand-crafted "wiki·git" wordmark.
//
// Appearance precedence mirrors ThemeBoot: a reader's saved choice > the tenant
// default > the build default. To avoid a flash on reload / View-Transition swap,
// the tenant bits are cached per host so the pre-paint scripts (ThemeBoot, the
// wordmark inline) can apply them before first paint on subsequent loads.

type ApKey = keyof AppearanceDefaults;

const ALLOW: Record<ApKey, readonly string[]> = {
  skin: ["wikigit", "wiki"],
  theme: ["auto", "light", "dark"],
  width: ["standard", "wide"],
  textsize: ["small", "standard", "large"],
};

const STORE: Record<ApKey, string> = {
  skin: "wng-skin",
  theme: "wng-theme",
  width: "wng-width",
  textsize: "wng-textsize",
};

export interface ChromeBits {
  title: string;
  tagline: string;
  appearance: AppearanceDefaults;
}

export function chromeBits(c: SiteConfig): ChromeBits {
  return { title: c.title, tagline: c.tagline, appearance: c.appearance };
}

// Pure: resolve the data-* values for <html> from a tenant's Appearance defaults,
// honouring a reader's saved override and OS dark preference. `prefersDark` is
// passed in so this stays free of `matchMedia` and is unit-testable.
export function resolveAppearance(
  defaults: AppearanceDefaults,
  saved: (key: ApKey) => string | null,
  prefersDark: boolean,
): { skin: string; width: string; textsize: string; theme: "light" | "dark" } {
  const pick = (key: ApKey): string => {
    const s = saved(key);
    if (s && ALLOW[key].includes(s)) return s;
    return defaults[key];
  };
  const theme = pick("theme");
  const dark = theme === "dark" || (theme === "auto" && prefersDark);
  return {
    skin: pick("skin"),
    width: pick("width"),
    textsize: pick("textsize"),
    theme: dark ? "dark" : "light",
  };
}

export function applyAppearance(doc: Document, appearance: AppearanceDefaults): void {
  const saved = (key: ApKey) => localStorage.getItem(STORE[key]);
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const r = resolveAppearance(appearance, saved, prefersDark);
  const d = doc.documentElement;
  d.dataset.skin = r.skin;
  d.dataset.width = r.width;
  d.dataset.textsize = r.textsize;
  d.dataset.theme = r.theme;
  // Keep the meta in sync so a View-Transition swap (ThemeBoot re-applies from the
  // incoming document's meta) doesn't revert to the build default.
  doc
    .querySelector('meta[name="wng-appearance"]')
    ?.setAttribute("content", JSON.stringify(appearance));
}

interface ElementLike {
  textContent: string | null;
  className: string;
  appendChild(child: ElementLike): void;
}
interface DocLike {
  querySelectorAll(selector: string): Iterable<ElementLike>;
  createElement(tag: string): ElementLike;
}

// Rewrite the header wordmark to the tenant's title (+ tagline). Replaces the
// baked "wiki·git" markup with a plain title span; uses textContent (never
// innerHTML) so a tenant title can't inject markup.
export function applyWordmark(doc: DocLike, title: string, tagline: string): void {
  for (const el of doc.querySelectorAll(".wordmark")) {
    el.textContent = "";
    const t = doc.createElement("span");
    t.className = "wm-title";
    t.textContent = title;
    el.appendChild(t);
    if (tagline) {
      const sub = doc.createElement("span");
      sub.className = "wordmark-sub";
      sub.textContent = tagline;
      el.appendChild(sub);
    }
  }
}

const CACHE_PREFIX = "wikigit:chrome:";

export function chromeCacheKey(host: string): string {
  return CACHE_PREFIX + host;
}

export function cacheChrome(host: string, bits: ChromeBits): void {
  try {
    sessionStorage.setItem(chromeCacheKey(host), JSON.stringify(bits));
  } catch {
    // private mode / storage full — pre-paint just falls back to the flash path
  }
}
