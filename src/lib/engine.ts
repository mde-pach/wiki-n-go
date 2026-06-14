import { config } from "../config";

// Tenant-aware Engine access. A wiki is one GitHub repo; the reader must name
// "which repo am I?" to the shared, multi-tenant Engine. See analysis/12.

export interface Repo {
  owner: string;
  name: string;
}

// A runtime override set by the hosted subdomain boot (`bootTenant`): one shared
// build serves every `foo.wikigit.org`, so the active repo can't be baked — it's
// resolved from the hostname at load and stored here. Null → use build config
// (apex, a fork, or self-host).
let override: Repo | null = null;

export function setActiveRepo(repo: Repo | null): void {
  override = repo;
}

// The wiki this reader represents: the runtime-resolved tenant if set, else the
// build config (`PUBLIC_REPO_OWNER/NAME`). Every content + Engine call routes
// through this, so overriding it repoints the whole reader at another wiki.
export function activeRepo(): Repo {
  return override ?? { owner: config.repoOwner, name: config.repoName };
}

export function repoSlug(repo: Repo = activeRepo()): string {
  return `${repo.owner}/${repo.name}`;
}

// A github.com URL for the active wiki's repo (e.g. `/commit/<sha>`, `/blob/...`).
// Client-only — uses the runtime tenant, so "view source" links point at the
// right repo on a hosted subdomain. Build-time (`.astro`) keeps baked config.
export function repoWebUrl(path = ""): string {
  return `https://github.com/${repoSlug()}${path}`;
}

// Append the `?repo=` tenant param to an Engine path. A query param (not a custom
// header) so simple GETs on the read path don't trigger a CORS preflight. Pure +
// unit-testable.
export function withRepoParam(path: string, slug: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}repo=${encodeURIComponent(slug)}`;
}

// Full Engine URL for a path. On the shared (multi-tenant) Engine the reader
// names its repo; a single-tenant self-host Engine ignores the param, so we only
// add it when `config.hostedBackend` is set — keeping self-host URLs clean.
export function engineUrl(path: string): string {
  const p = config.hostedBackend ? withRepoParam(path, repoSlug()) : path;
  return `${config.workerUrl}${p}`;
}
