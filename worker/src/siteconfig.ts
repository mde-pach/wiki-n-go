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
  // Logins the owner grants maintainer tier, declaratively, from the settings
  // form. A plain entry is read as a GitHub login (`gh:<entry>`); an explicit
  // `gh:`/`wg:`/`anon-` key targets that exact identity. Unioned with the
  // imperative grant/revoke `trusted-editors.json` list (see trust.ts).
  maintainers?: string[];
}

// Identity keys/logins are conservative: a bare login, or a provider-qualified
// key. Anything else (spaces, markup) is dropped so the list can't smuggle junk.
const MAINTAINER_RE = /^(?:gh:|wg:|anon-)?[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

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

  if (Array.isArray(src.maintainers)) {
    const seen = new Set<string>();
    for (const raw of src.maintainers) {
      const m = str(raw, 80);
      if (m && MAINTAINER_RE.test(m) && !seen.has(m)) seen.add(m);
      if (seen.size >= 100) break;
    }
    if (seen.size) out.maintainers = [...seen];
  }

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
