import { repoInstallationId, usingApp } from "./githubApp";
import { HttpError } from "./http";
import type { Env } from "./types";

// Multi-tenant (the "giscus model"): one operator-run Worker + App serving any
// repo that installs it. The target repo comes from the request, not just env,
// and every per-repo bit of state is isolated:
//   • KV keys are prefixed by the repo (`namespacedKV`), so one tenant's
//     rate-limit/trust/index/tag/patrol/3RR caches can't be read or clobbered by
//     another — covers every key without auditing each call site.
//   • bans/trusted-editors/audit/content are repo *files*, so overriding
//     REPO_OWNER/REPO_NAME alone namespaces them (each repo carries its own).
//   • the write credential is already per-repo (App installation token).
// Single-tenant (no MULTI_TENANT) is the default and ignores any request repo —
// a Worker pinned to one repo can't be redirected at another (it holds that
// repo's credential). Privacy invariant is unchanged: only `ip_hash` is
// committed; the operator sees the raw IP only transiently before hashing.

export interface Repo {
  owner: string;
  name: string;
}

// GitHub owner/name grammar (no slashes inside either part → exactly one `/`).
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const TENANT_TTL_S = 3600; // cache the "App is installed on this repo" check 1h.

export function multiTenant(env: Env): boolean {
  return env.MULTI_TENANT === "1" || env.MULTI_TENANT === "true";
}

// Wrap a KV namespace so every key is transparently prefixed. Two tenants over
// the same backing namespace get disjoint keyspaces (the prefix differs and
// owner/name can't contain `/`, so prefixes never alias). `list` is scoped too.
export function namespacedKV(kv: KVNamespace, prefix: string): KVNamespace {
  const k = (key: string) => `${prefix}${key}`;
  return {
    get: (key: string, opts?: unknown) =>
      (kv.get as (k: string, o?: unknown) => Promise<unknown>)(k(key), opts),
    getWithMetadata: (key: string, opts?: unknown) =>
      (kv.getWithMetadata as (k: string, o?: unknown) => Promise<unknown>)(
        k(key),
        opts,
      ),
    put: (key: string, value: string, opts?: KVNamespacePutOptions) =>
      kv.put(k(key), value, opts),
    delete: (key: string) => kv.delete(k(key)),
    list: async (opts?: KVNamespaceListOptions) => {
      const res = await kv.list({ ...opts, prefix: `${prefix}${opts?.prefix ?? ""}` });
      // Strip the prefix back off so the wrapper is transparent to callers.
      return {
        ...res,
        keys: res.keys.map((e) => ({ ...e, name: e.name.slice(prefix.length) })),
      };
    },
  } as unknown as KVNamespace;
}

// The repo named by the request: `X-Wiki-Repo: owner/name` header (works for GET
// and POST without touching the body), else a `?repo=` query param. Absent → the
// operator's configured default. A malformed value is a 400.
export function requestedRepo(request: Request): Repo | null {
  const raw =
    request.headers.get("X-Wiki-Repo") ?? new URL(request.url).searchParams.get("repo");
  if (!raw) return null;
  if (!REPO_RE.test(raw)) throw new HttpError(400, "Invalid repo.");
  const [owner, name] = raw.split("/");
  return { owner, name };
}

// Confirm the App is installed on the target repo before serving it (cached in
// the raw, un-prefixed KV under a `tenant:` key — distinct from the `r:` tenant
// prefix, so no collision). Stops a shared Worker being pointed at a repo that
// never opted in.
async function assertServed(env: Env, repo: Repo): Promise<void> {
  const kv = env.RATE_LIMIT;
  const cacheKey = `tenant:served:${repo.owner}/${repo.name}`;
  if (kv && (await kv.get(cacheKey))) return;
  const id = await repoInstallationId(env, repo.owner, repo.name);
  if (!id) throw new HttpError(404, "This repository hasn't installed the wiki app.");
  if (kv) await kv.put(cacheKey, id, { expirationTtl: TENANT_TTL_S });
}

// Per-request env scoped to the target repo. Single-tenant → env unchanged.
// Multi-tenant → repo from the request (validated + installed), KV prefixed, and
// operator-pinned overrides cleared so each tenant derives its own ids.
export async function resolveTenant(env: Env, request: Request): Promise<Env> {
  if (!multiTenant(env)) return env;
  if (!usingApp(env))
    throw new HttpError(500, "Multi-tenant mode requires a GitHub App credential.");
  const repo = requestedRepo(request) ?? { owner: env.REPO_OWNER, name: env.REPO_NAME };
  await assertServed(env, repo);
  return {
    ...env,
    REPO_OWNER: repo.owner,
    REPO_NAME: repo.name,
    REPO_ID: undefined,
    DISCUSSION_CATEGORY_ID: undefined,
    GITHUB_APP_INSTALLATION_ID: undefined,
    RATE_LIMIT: env.RATE_LIMIT
      ? namespacedKV(env.RATE_LIMIT, `r:${repo.owner}/${repo.name}:`)
      : env.RATE_LIMIT,
  };
}
