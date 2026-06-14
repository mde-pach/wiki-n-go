import { config } from "../config";
import { engineUrl, type Repo, setActiveRepo } from "./engine";

// Hosted multi-tenant boot. One static build is served for every
// `foo.wikigit.org`, so the reader can't know at build time which wiki it is —
// it learns from the hostname at load: resolve `foo` → repo via the Engine, then
// point `activeRepo()` at it. The apex/flagship and non-platform hosts (a fork on
// GitHub Pages, a self-host domain) keep the baked config and make no call.

// The subdomain label of a host under the platform apex: `foo.wikigit.org` → "foo",
// the apex itself → "", a host outside the platform domain → null.
export function subdomainLabel(host: string, platformHost: string): string | null {
  const h = host.toLowerCase().split(":")[0].replace(/\.$/, "");
  const base = platformHost.toLowerCase();
  if (!base || h === base) return h === base ? "" : null;
  if (!h.endsWith(`.${base}`)) return null;
  return h
    .slice(0, -(base.length + 1))
    .split(".")
    .slice(-1)[0];
}

function parseRepo(slug: string): Repo | null {
  const [owner, name, ...rest] = slug.split("/");
  return owner && name && rest.length === 0 ? { owner, name } : null;
}

const CACHE_PREFIX = "wikigit:tenant:";

let booted: Promise<void> | null = null;

// Resolve the active tenant from the current hostname, once. Idempotent and
// memoized, so every data fetch can `await bootTenant()` cheaply. A no-op on the
// server, the apex, and non-platform hosts — only a real subdomain hits /resolve.
export function bootTenant(): Promise<void> {
  booted ??= resolveOnce();
  return booted;
}

// The single Engine fetch chokepoint: resolves the tenant before building the URL
// so every call carries the right `?repo=`. Use this for all Engine reads/writes
// (not `fetch(engineUrl(...))` directly) so the boot gate can't be forgotten.
export async function engineFetch(path: string, init?: RequestInit): Promise<Response> {
  await bootTenant();
  return fetch(engineUrl(path), init);
}

async function resolveOnce(): Promise<void> {
  if (typeof window === "undefined") return; // build/SSR: keep baked config
  const host = window.location.host;
  const label = subdomainLabel(host, config.platformHost);
  // Skip only the flagship apex/www (baked). A platform subdomain (label) AND a
  // host outside the platform domain (null = a possible custom domain) both ask
  // the Engine — an unregistered host just 404s and falls back to baked config.
  if (label === "" || label === "www") return;

  const cached = sessionStorage.getItem(CACHE_PREFIX + host);
  if (cached) {
    const repo = parseRepo(cached);
    if (repo) {
      setActiveRepo(repo);
      return;
    }
  }
  try {
    const res = await fetch(
      `${config.workerUrl}/resolve?host=${encodeURIComponent(host)}`,
    );
    if (!res.ok) return; // unregistered subdomain → leave baked (claim UI is phase 4)
    const { repo } = (await res.json()) as { repo: string };
    const parsed = parseRepo(repo);
    if (parsed) {
      setActiveRepo(parsed);
      sessionStorage.setItem(CACHE_PREFIX + host, repo);
    }
  } catch {
    // network hiccup → fall back to baked config rather than blocking the reader
  }
}
