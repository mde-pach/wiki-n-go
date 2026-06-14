import { config } from "../config";

// Tenant-aware Engine access. A wiki is one GitHub repo; the reader must name
// "which repo am I?" to the shared, multi-tenant Engine. See analysis/12.

export interface Repo {
  owner: string;
  name: string;
}

// The wiki this reader represents. Baked from build config for a fork / self-host
// (`PUBLIC_REPO_OWNER/NAME`). The hosted `foo.wikigit.org` subdomain path resolves
// it at runtime from the hostname instead — that lookup plugs in here (P2 Hub);
// until then this is the single source of truth and the structure is ready.
export function activeRepo(): Repo {
  return { owner: config.repoOwner, name: config.repoName };
}

export function repoSlug(repo: Repo = activeRepo()): string {
  return `${repo.owner}/${repo.name}`;
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
