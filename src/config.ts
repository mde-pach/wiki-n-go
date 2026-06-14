// Site config. Each value is injected at build time from a PUBLIC_* env var
// (set by the GitHub Pages workflow from repo context / repo variables) and
// falls back to the literal here, so a fork builds correctly with no edits and
// a local build behaves exactly as before.
// `||` (not `??`): an unset GitHub repo variable reaches the build as an empty
// string, which must fall back to the literal — not blank the value out.
const env = import.meta.env;

export const config = {
  repoOwner: env.PUBLIC_REPO_OWNER || "mde-pach",
  repoName: env.PUBLIC_REPO_NAME || "wiki-n-go",
  branch: "main",
  contentDir: "content",
  homeSlug: "index",
  // The Engine backend (portable Bun server, M11) — set PUBLIC_WORKER_URL at build
  // to point a fork at its own deployment; the literal is the canonical instance.
  workerUrl: env.PUBLIC_WORKER_URL || "https://api.wikigit.org",
  // Self-hosted proof-of-work bot check (no third-party service): anonymous
  // writes solve a SHA-256 puzzle of this many leading zero bits before the
  // Worker accepts them. Must match the Worker's POW_BITS; `0` disables it.
  powBits: Number(env.PUBLIC_POW_BITS || "18"),
  // Interlanguage (M8). The default language is languageless: its pages keep bare
  // slugs (`/coffee`), other languages are URL-prefixed (`/fr/cafe`). The codes
  // here double as the reserved slug prefixes that mark a page's language.
  defaultLang: "en",
  languages: [
    { code: "en", name: "English" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
  ],
  // Default Appearance (Vector-2022 right-rail panel). A page may override any
  // field via `appearance:` frontmatter; a reader's own saved choice wins over
  // both. `theme: "auto"` follows the OS (resolved client-side, pre-paint).
  appearance: {
    skin: "wikigit",
    theme: "light",
    width: "standard",
    textsize: "standard",
  } satisfies AppearanceDefaults,
};

export interface AppearanceDefaults {
  skin: "wikigit" | "wiki";
  theme: "auto" | "light" | "dark";
  width: "standard" | "wide";
  textsize: "small" | "standard" | "large";
}
