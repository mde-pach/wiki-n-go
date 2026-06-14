import { gh } from "./github";
import { HttpError } from "./http";
import { getCurrentFile } from "./repo";
import type { Env } from "./types";

// The tenant registry: the name→repo map that lets one shared frontend + one
// multi-tenant Engine serve every `foo.wikigit.org`. An append-only git file in
// the OPERATOR repo (mirrors `.wikigit/moderation.jsonl`), so no DB — the no-DB
// invariant holds for the platform layer too. Read before `resolveTenant` (the
// registry is operator-global, not per-tenant), cached briefly in memory.

export const TENANTS_PATH = ".wikigit/tenants.jsonl";
const CACHE_TTL_S = 30; // brief: registration must show up fast, GitHub mustn't be hammered.
const CACHE_KEY = "registry:raw";

export type Lane = "platform" | "byo";

export interface Tenant {
  name: string; // subdomain label, e.g. "recipes" → recipes.wikigit.org
  repo: string; // "owner/name"
  owner: string; // the registering identity (e.g. "gh:alice" / "wg:bob")
  lane: Lane;
  at: string; // ISO timestamp, stamped by the caller (clock-free here)
  domain?: string; // a verified custom host (e.g. "wiki.mybrand.com") → this wiki
}

// Subdomains that are real infrastructure, never tenant wikis.
const RESERVED = new Set([
  "www",
  "api",
  "auth",
  "mail",
  "mta-sts",
  "autoconfig",
  "autodiscover",
  "ns1",
  "ns2",
  "admin",
  "status",
  "app",
]);

// DNS label, lowercased: 1–40 chars, alphanumeric, internal hyphens only.
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
// A fully-qualified custom host: ≥2 dot-separated labels, lowercased.
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function validName(name: string): boolean {
  return NAME_RE.test(name) && !RESERVED.has(name);
}

export function validDomain(host: string): boolean {
  return DOMAIN_RE.test(host.toLowerCase());
}

export function parseRegistry(raw: string | undefined): Tenant[] {
  if (!raw) return [];
  const out: Tenant[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const t = JSON.parse(line) as Tenant;
      if (
        typeof t.name === "string" &&
        REPO_RE.test(t.repo) &&
        (t.lane === "platform" || t.lane === "byo")
      ) {
        // Drop a malformed custom domain rather than the whole tenant line.
        if (t.domain && !validDomain(t.domain)) t.domain = undefined;
        out.push(t);
      }
    } catch {}
  }
  return out;
}

// Last write wins, so a later line can re-point or re-register a name.
export function latestByName(tenants: Tenant[]): Map<string, Tenant> {
  const m = new Map<string, Tenant>();
  for (const t of tenants) m.set(t.name, t);
  return m;
}

// Verified custom host → tenant, from the latest-by-name view (so a tenant's most
// recent line decides its domain; clearing `domain` on a later line drops it).
export function latestByDomain(latest: Map<string, Tenant>): Map<string, Tenant> {
  const m = new Map<string, Tenant>();
  for (const t of latest.values()) if (t.domain) m.set(t.domain.toLowerCase(), t);
  return m;
}

// An owner's current managed (platform-lane) wikis, from the latest-by-name view
// — re-pointing a name you already own isn't a new wiki, and byo wikis live in
// the owner's own repo so they don't count against the hosted quota.
export function ownerWikiCount(latest: Map<string, Tenant>, owner: string): number {
  let n = 0;
  for (const t of latest.values()) {
    if (t.lane === "platform" && t.owner === owner) n++;
  }
  return n;
}

async function readRaw(env: Env): Promise<string | undefined> {
  const kv = env.RATE_LIMIT;
  if (kv) {
    const hit = await kv.get(CACHE_KEY);
    if (hit !== null && hit !== undefined) return hit;
  }
  const file = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    TENANTS_PATH,
  );
  const raw = file?.raw ?? "";
  if (kv) await kv.put(CACHE_KEY, raw, { expirationTtl: CACHE_TTL_S });
  return raw;
}

export async function readRegistry(env: Env): Promise<Map<string, Tenant>> {
  return latestByName(parseRegistry(await readRaw(env)));
}

// The tenant label of a request host: `foo.wikigit.org` → "foo", the apex or
// `www` → "" (the flagship), a host outside the platform domain → null.
export function tenantLabel(host: string, platformHost: string): string | null {
  const h = host.toLowerCase().split(":")[0].replace(/\.$/, "");
  const base = (platformHost || h.split(".").slice(-2).join(".")).toLowerCase();
  if (h === base) return "";
  if (h.endsWith(`.${base}`)) {
    const label = h.slice(0, -(base.length + 1));
    return label.includes(".") ? label.split(".").slice(-1)[0] : label;
  }
  return null;
}

export interface Resolution {
  name: string;
  repo: string;
  lane: Lane;
}

// Resolve a request host to the wiki it should render. Apex/www → the operator's
// own flagship repo; a registered label → its tenant; anything else → null.
export async function resolveHost(env: Env, host: string): Promise<Resolution | null> {
  const label = tenantLabel(host, env.PLATFORM_HOST ?? "");
  // A host outside the platform domain is only a wiki if it's a verified custom
  // domain in the registry (BYO owners point `wiki.mybrand.com` at us).
  if (label === null) {
    const h = host.toLowerCase().split(":")[0].replace(/\.$/, "");
    const t = latestByDomain(await readRegistry(env)).get(h);
    return t ? { name: t.name, repo: t.repo, lane: t.lane } : null;
  }
  if (label === "" || label === "www") {
    return {
      name: "",
      repo: `${env.REPO_OWNER}/${env.REPO_NAME}`,
      lane: "platform",
    };
  }
  if (RESERVED.has(label)) return null;
  const tenant = (await readRegistry(env)).get(label);
  return tenant ? { name: tenant.name, repo: tenant.repo, lane: tenant.lane } : null;
}

export interface Availability {
  name: string;
  available: boolean;
  reason?: "invalid" | "reserved" | "taken";
}

export async function nameAvailability(env: Env, name: string): Promise<Availability> {
  const n = name.toLowerCase();
  if (RESERVED.has(n)) return { name: n, available: false, reason: "reserved" };
  if (!NAME_RE.test(n)) return { name: n, available: false, reason: "invalid" };
  const taken = (await readRegistry(env)).has(n);
  return { name: n, available: !taken, reason: taken ? "taken" : undefined };
}

// Append a tenant to the registry (the claim flow's write primitive). Validates
// format + reservation + uniqueness; throws a clean 4xx otherwise. `at` is passed
// in so this stays clock-free (and resumable). Invalidates the read cache.
export async function registerTenant(
  env: Env,
  t: Tenant,
  by: { name: string; email: string },
): Promise<void> {
  if (!validName(t.name)) throw new HttpError(400, "Invalid or reserved name.");
  if (!REPO_RE.test(t.repo)) throw new HttpError(400, "Invalid repo.");
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    TENANTS_PATH,
  );
  if (latestByName(parseRegistry(current?.raw)).has(t.name)) {
    throw new HttpError(409, "Name already taken.");
  }
  await appendTenant(env, t, by, current, `tenant: register ${t.name} → ${t.repo}`);
}

// Re-point an EXISTING tenant to a new repo (append a line; last write wins). The
// transfer bridge uses this after a managed repo moves to the owner's account —
// unlike registerTenant it requires the name to already exist (it's an update).
export async function repointTenant(
  env: Env,
  t: Tenant,
  by: { name: string; email: string },
): Promise<void> {
  if (!REPO_RE.test(t.repo)) throw new HttpError(400, "Invalid repo.");
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    TENANTS_PATH,
  );
  if (!latestByName(parseRegistry(current?.raw)).has(t.name)) {
    throw new HttpError(404, "No such wiki.");
  }
  await appendTenant(env, t, by, current, `tenant: re-point ${t.name} → ${t.repo}`);
}

// Attach a verified custom domain to an existing tenant (append a line carrying
// the new `domain`, last write wins). The caller has already verified ownership +
// DNS; this only persists the mapping.
export async function setTenantDomain(
  env: Env,
  t: Tenant,
  by: { name: string; email: string },
): Promise<void> {
  if (!t.domain || !validDomain(t.domain)) throw new HttpError(400, "Invalid domain.");
  if (!REPO_RE.test(t.repo)) throw new HttpError(400, "Invalid repo.");
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    TENANTS_PATH,
  );
  if (!latestByName(parseRegistry(current?.raw)).has(t.name)) {
    throw new HttpError(404, "No such wiki.");
  }
  await appendTenant(
    env,
    t,
    by,
    current,
    `tenant: custom domain ${t.name} → ${t.domain}`,
  );
}

// `at` is passed in by callers so the registry stays clock-free; the append is
// idempotent-friendly (last write wins) and busts the read cache.
async function appendTenant(
  env: Env,
  t: Tenant,
  by: { name: string; email: string },
  current: { raw?: string; sha?: string } | null,
  message: string,
): Promise<void> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const prefix = current?.raw ? current.raw.replace(/\n*$/, "\n") : "";
  await gh(env, `/repos/${repo}/contents/${TENANTS_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: btoa(`${prefix}${JSON.stringify(t)}\n`),
      branch: env.BRANCH,
      sha: current?.sha,
      author: by,
    }),
  });
  if (env.RATE_LIMIT) await env.RATE_LIMIT.delete(CACHE_KEY);
}
