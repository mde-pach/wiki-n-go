// The owner-editable wiki config that lives as data, not code: `wikigit.json` at
// the repo root. The reader merges it over its baked defaults at runtime, and the
// in-site settings form commits it — so a non-technical owner changes the title,
// languages, or theme without touching code or triggering a rebuild.

export interface WikigitConfig {
  title?: string;
  tagline?: string;
  description?: string;
  homeSlug?: string;
  defaultLang?: string;
  languages?: { code: string; name: string }[];
  appearance?: {
    skin?: "wikigit" | "wiki";
    theme?: "auto" | "light" | "dark";
    width?: "standard" | "wide";
    textsize?: "small" | "standard" | "large";
  };
  signin?: boolean;
}

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;
const SLUG_RE = /^[a-z0-9][a-z0-9/_-]*$/;
const APPEARANCE: Record<string, readonly string[]> = {
  skin: ["wikigit", "wiki"],
  theme: ["auto", "light", "dark"],
  width: ["standard", "wide"],
  textsize: ["small", "standard", "large"],
};

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined;
}

// Whitelist + type-check an untrusted config blob into a clean WikigitConfig,
// dropping anything malformed (never throws — a bad field is omitted, not fatal).
// Shared by the write endpoint (validate input) and the read parse (sanitize the
// committed file), so the reader never trusts raw JSON.
export function sanitizeConfig(input: unknown): WikigitConfig {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: WikigitConfig = {};

  const title = str(src.title, 80);
  if (title) out.title = title;
  const tagline = str(src.tagline, 120);
  if (tagline) out.tagline = tagline;
  const description = str(src.description, 300);
  if (description) out.description = description;

  const home = str(src.homeSlug, 120);
  if (home && SLUG_RE.test(home)) out.homeSlug = home;

  const def = str(src.defaultLang, 8);
  if (def && LANG_RE.test(def)) out.defaultLang = def;

  if (Array.isArray(src.languages)) {
    const langs = src.languages
      .map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        const code = str(o.code, 8);
        const name = str(o.name, 40);
        return code && name && LANG_RE.test(code) ? { code, name } : null;
      })
      .filter((l): l is { code: string; name: string } => l !== null)
      .slice(0, 50);
    if (langs.length) out.languages = langs;
  }

  if (src.appearance && typeof src.appearance === "object") {
    const a = src.appearance as Record<string, unknown>;
    const app: Record<string, string> = {};
    for (const [key, allowed] of Object.entries(APPEARANCE)) {
      const v = a[key];
      if (typeof v === "string" && allowed.includes(v)) app[key] = v;
    }
    if (Object.keys(app).length) out.appearance = app as WikigitConfig["appearance"];
  }

  if (typeof src.signin === "boolean") out.signin = src.signin;

  return out;
}

export function parseConfigFile(raw: string | undefined): WikigitConfig {
  if (!raw?.trim()) return {};
  try {
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}
