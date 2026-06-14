import { type AppearanceDefaults, config } from "../config";
import { getJson } from "./api";
import { onSwapReset } from "./cache-reset";

// The owner-editable wiki config (committed as `wikigit.json`, served by the
// Engine's /config). The reader merges it over the build-baked defaults at
// runtime, so a hosted tenant's title / languages / theme come from its repo —
// no rebuild, no code. See worker/src/siteconfig.ts for the on-disk shape.

export interface WikigitConfig {
  title?: string;
  tagline?: string;
  description?: string;
  homeSlug?: string;
  defaultLang?: string;
  languages?: { code: string; name: string }[];
  appearance?: Partial<AppearanceDefaults>;
  signin?: boolean;
}

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  homeSlug: string;
  defaultLang: string;
  languages: { code: string; name: string }[];
  appearance: AppearanceDefaults;
  signin: boolean;
}

export function defaultSiteConfig(): SiteConfig {
  return {
    title: "Wikigit",
    tagline: "the open reference",
    description: "",
    homeSlug: config.homeSlug,
    defaultLang: config.defaultLang,
    languages: config.languages,
    appearance: config.appearance,
    signin: true,
  };
}

export function mergeSiteConfig(over: WikigitConfig): SiteConfig {
  const base = defaultSiteConfig();
  return {
    title: over.title ?? base.title,
    tagline: over.tagline ?? base.tagline,
    description: over.description ?? base.description,
    homeSlug: over.homeSlug ?? base.homeSlug,
    defaultLang: over.defaultLang ?? base.defaultLang,
    languages: over.languages?.length ? over.languages : base.languages,
    appearance: { ...base.appearance, ...over.appearance },
    signin: over.signin ?? base.signin,
  };
}

let cache: Promise<SiteConfig> | undefined;

// Load + merge the active wiki's config once. Falls back to baked defaults when
// there's no Engine or it's unreachable, so the reader never blocks on it.
export function loadSiteConfig(): Promise<SiteConfig> {
  cache ??= fetchConfig();
  return cache;
}

async function fetchConfig(): Promise<SiteConfig> {
  if (!config.workerUrl) return defaultSiteConfig();
  try {
    const { config: over } = await getJson<{ config: WikigitConfig }>("/config", {
      cache: "default",
    });
    return mergeSiteConfig(over ?? {});
  } catch {
    return defaultSiteConfig();
  }
}

// A saved settings change should show without a reload (mirrors content swaps).
onSwapReset(() => {
  cache = undefined;
});
