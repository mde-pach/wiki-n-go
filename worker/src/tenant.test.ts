import { describe, expect, it } from "vitest";
import type { KV } from "./store";
import { multiTenant, namespacedKV, requestedRepo, resolveTenant } from "./tenant";
import type { Env } from "./types";

function fakeKV() {
  const m = new Map<string, string>();
  return {
    store: m,
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    list: async ({ prefix = "" }: { prefix?: string } = {}) => ({
      keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
    }),
  } as unknown as KV & { store: Map<string, string> };
}

const baseEnv = (extra: Partial<Env> = {}): Env =>
  ({
    HASH_SECRET: "s",
    POW_BITS: "0",
    REPO_OWNER: "owner",
    REPO_NAME: "repo",
    BRANCH: "main",
    CONTENT_DIR: "content",
    ALLOWED_ORIGIN: "https://x.test",
    ...extra,
  }) as Env;

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(`https://w.dev${url}`, { headers });

describe("multiTenant", () => {
  it("is true only for the opt-in flag values", () => {
    expect(multiTenant(baseEnv({ MULTI_TENANT: "1" }))).toBe(true);
    expect(multiTenant(baseEnv({ MULTI_TENANT: "true" }))).toBe(true);
    expect(multiTenant(baseEnv())).toBe(false);
    expect(multiTenant(baseEnv({ MULTI_TENANT: "0" }))).toBe(false);
  });
});

describe("requestedRepo", () => {
  it("reads the X-Wiki-Repo header", () => {
    expect(requestedRepo(req("/latest", { "X-Wiki-Repo": "a/b" }))).toEqual({
      owner: "a",
      name: "b",
    });
  });
  it("falls back to the ?repo= query param", () => {
    expect(requestedRepo(req("/latest?repo=foo/bar"))).toEqual({
      owner: "foo",
      name: "bar",
    });
  });
  it("returns null when absent", () => {
    expect(requestedRepo(req("/latest"))).toBeNull();
  });
  it("rejects a malformed repo", () => {
    for (const bad of ["nostash", "a/b/c", "a/", "/b", "a b/c"]) {
      expect(() => requestedRepo(req("/latest", { "X-Wiki-Repo": bad }))).toThrow();
    }
  });
});

describe("namespacedKV isolation", () => {
  it("gives two tenants disjoint keyspaces over one backing namespace", async () => {
    const backing = fakeKV();
    const a = namespacedKV(backing, "r:o/a:");
    const b = namespacedKV(backing, "r:o/b:");

    await a.put("trust:anon-1", "tenant-a");
    await b.put("trust:anon-1", "tenant-b");

    // Same logical key, but each tenant reads only its own value.
    expect(await a.get("trust:anon-1")).toBe("tenant-a");
    expect(await b.get("trust:anon-1")).toBe("tenant-b");

    // The backing store holds two distinct, prefixed keys — no clobber.
    expect(backing.store.get("r:o/a:trust:anon-1")).toBe("tenant-a");
    expect(backing.store.get("r:o/b:trust:anon-1")).toBe("tenant-b");

    // A delete in one tenant doesn't touch the other.
    await a.delete("trust:anon-1");
    expect(await a.get("trust:anon-1")).toBeNull();
    expect(await b.get("trust:anon-1")).toBe("tenant-b");
  });

  it("scopes list() to the tenant's prefix", async () => {
    const backing = fakeKV();
    const a = namespacedKV(backing, "r:o/a:");
    const b = namespacedKV(backing, "r:o/b:");
    await a.put("tag:1", "x");
    await a.put("tag:2", "y");
    await b.put("tag:1", "z");

    const listed = await a.list();
    expect(listed.keys.map((k) => k.name).sort()).toEqual(["tag:1", "tag:2"]);
  });
});

describe("resolveTenant", () => {
  it("returns env unchanged in single-tenant mode, ignoring any request repo", async () => {
    const env = baseEnv();
    const out = await resolveTenant(
      env,
      req("/latest", { "X-Wiki-Repo": "evil/repo" }),
    );
    expect(out).toBe(env);
    expect(out.REPO_OWNER).toBe("owner");
    expect(out.REPO_NAME).toBe("repo");
  });

  it("requires a GitHub App credential when multi-tenant is on", async () => {
    const env = baseEnv({ MULTI_TENANT: "1", GITHUB_TOKEN: "pat" });
    await expect(
      resolveTenant(env, req("/latest", { "X-Wiki-Repo": "a/b" })),
    ).rejects.toThrow(/GitHub App/);
  });
});
