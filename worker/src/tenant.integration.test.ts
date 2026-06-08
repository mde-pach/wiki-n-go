import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import type { Env } from "./types";

// A real 512-bit PKCS#1 key (test-only) — the format GitHub's manifest flow
// returns, so the multi-tenant App-token path runs end to end here.
const PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBALVh4ios5EUmPMWZh4q0Yb/bLxhoG9UTq4WzNtXVHq8wOf1USuzW
lc0TKIGmNTqPr+Fh66Qir56ofAABbdCQF+cCAwEAAQJBAKaOX7QCzQqCdkOtG73O
rgQTLUfoMcaT7Wk0jCIHNcn/nygpnnj8WjUaK+012g10pO2dOlorHt0Etrdfwxwm
3eECIQDcSIcwni8TUTXeOGhWXmRo7x9X8FsGqTEPeUSTnDcwDQIhANLKqbdQ+TSD
GC1G79/DyozamWQLSPURsnx8kZ9DQvbDAiBIkKfgLyvIzEbXhnNwiDXBj4wetvH1
dsTPmR4rFhnj/QIhAJ+IQmo7HmBf1yxtQ55W0DVKPE07PTw86JjOrmeawFOBAiB9
DJPdlG5QQzgJkaj/LtI377B/tWYOuCEzTRtzak7kiQ==
-----END RSA PRIVATE KEY-----`;

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
  } as unknown as KVNamespace & { store: Map<string, string> };
}

function makeEnv(kv: KVNamespace): Env {
  return {
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: PKCS1_PEM,
    HASH_SECRET: "s",
    POW_BITS: "0",
    REPO_OWNER: "operator",
    REPO_NAME: "default",
    BRANCH: "main",
    CONTENT_DIR: "content",
    ALLOWED_ORIGIN: "https://x.test",
    MULTI_TENANT: "1",
    RATE_LIMIT: kv,
  } as unknown as Env;
}

// owner of the repo named in a GitHub API URL (`/repos/<owner>/<name>/…`).
const repoOwnerOf = (url: string) => url.match(/\/repos\/([^/]+)\//)?.[1] ?? "";

// Stub the App credential flow + per-repo data keyed by repo owner.
function stubGitHub(opts: {
  sha?: (owner: string) => string;
  bans?: (owner: string) => unknown[];
}) {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/installation")) return Response.json({ id: 100 });
    if (url.includes("/access_tokens"))
      return Response.json({
        token: "itok",
        expires_at: "2999-01-01T00:00:00Z",
      });
    if (url.includes("/commits/main"))
      return new Response(opts.sha?.(repoOwnerOf(url)) ?? "sha");
    if (url.includes("/contents/bans.json")) {
      const list = opts.bans?.(repoOwnerOf(url)) ?? [];
      return Response.json({
        sha: "b",
        content: btoa(JSON.stringify(list)),
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const get = (path: string, repo: string) =>
  new Request(`https://w.dev${path}`, {
    headers: { Origin: "https://x.test", "X-Wiki-Repo": repo },
  });

afterEach(() => vi.unstubAllGlobals());

describe("multi-tenant KV isolation", () => {
  it("namespaces cached state per repo over one backing KV", async () => {
    const kv = fakeKV();
    stubGitHub({ sha: (owner) => (owner === "alice" ? "aaaaaa1" : "bbbbbb2") });

    const a = await (
      await worker.fetch(get("/latest", "alice/wiki"), makeEnv(kv))
    ).json();
    const b = await (
      await worker.fetch(get("/latest", "bob/wiki"), makeEnv(kv))
    ).json();

    expect(a).toEqual({ sha: "aaaaaa1" });
    expect(b).toEqual({ sha: "bbbbbb2" });

    // Each tenant's sha lives under its own prefixed key — no shared slot.
    expect(kv.store.has("r:alice/wiki:meta:latest-sha")).toBe(true);
    expect(kv.store.has("r:bob/wiki:meta:latest-sha")).toBe(true);
    expect(kv.store.has("meta:latest-sha")).toBe(false);
  });

  it("rejects a repo that hasn't installed the app", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/installation")) return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const res = await worker.fetch(get("/latest", "stranger/wiki"), makeEnv(fakeKV()));
    expect(res.status).toBe(404);
  });
});

describe("multi-tenant bans isolation", () => {
  it("reads each tenant's bans from its own repo", async () => {
    const kv = fakeKV();
    stubGitHub({
      bans: (owner) =>
        owner === "alice" ? [{ key: "anon-aaa" }] : [{ key: "anon-bbb" }],
    });

    const a = (await (
      await worker.fetch(get("/bans", "alice/wiki"), makeEnv(kv))
    ).json()) as { bans: { key: string }[] };
    const b = (await (
      await worker.fetch(get("/bans", "bob/wiki"), makeEnv(kv))
    ).json()) as { bans: { key: string }[] };

    expect(a.bans.map((x) => x.key)).toEqual(["anon-aaa"]);
    expect(b.bans.map((x) => x.key)).toEqual(["anon-bbb"]);
  });
});
