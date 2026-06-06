import { config } from "../config";

// Set of all existing page slugs — powers wikilink resolution, red links,
// search, and backlinks. Fetched once per session from the Worker.
let cache: Promise<Set<string>> | undefined;

export function pageSet(): Promise<Set<string>> {
  if (!cache) cache = load();
  return cache;
}

async function load(): Promise<Set<string>> {
  if (!config.workerUrl) return new Set();
  try {
    const res = await fetch(`${config.workerUrl}/pages`, { cache: "no-store" });
    if (!res.ok) return new Set();
    return new Set(((await res.json()) as { pages: string[] }).pages);
  } catch {
    return new Set();
  }
}
