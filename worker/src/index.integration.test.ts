import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import type { LinkGraph } from "./indexlib";

type Env = Parameters<typeof worker.fetch>[1];

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

// Stub the GitHub API: a content tree + per-file contents (base64).
const FILES: Record<string, string> = {
  "index.md": "# Home\n\nSee [[getting-started]] and [[missing-page]].",
  "getting-started.md": "---\nredirect: index\n---\n\n#REDIRECT",
};

function stubGitHub() {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/git/trees/")) {
      return Response.json({
        tree: Object.keys(FILES).map((f) => ({
          path: `content/${f}`,
          type: "blob",
        })),
      });
    }
    const m = url.match(/\/contents\/content\/(.+?)\?/);
    if (m) {
      const raw = FILES[decodeURIComponent(m[1])];
      if (raw === undefined) return new Response("", { status: 404 });
      return Response.json({ sha: "x", content: btoa(raw) });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "t",
    HASH_SECRET: "s",
    POW_BITS: "0",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    HOME_SLUG: "index",
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const req = (path: string) =>
  new Request(`https://w.dev${path}`, { headers: { Origin: "https://example.test" } });

afterEach(() => vi.unstubAllGlobals());

describe("GET /status (setup-page diagnostics)", () => {
  it("reports single-tenant mode, served, and the credential/sign-in state", async () => {
    stubGitHub();
    const res = await worker.fetch(req("/status"), makeEnv());
    expect(res.status).toBe(200);
    const s = (await res.json()) as {
      ok: boolean;
      mode: string;
      repo: string;
      served: boolean;
      writeCredential: string;
      signin: { enabled: boolean };
    };
    expect(s.ok).toBe(true);
    expect(s.mode).toBe("single");
    expect(s.repo).toBe("o/r");
    expect(s.served).toBe(true); // single-tenant is always served
    expect(s.writeCredential).toBe("token"); // makeEnv has GITHUB_TOKEN
  });
});

describe("reverse-proxy scheme (X-Forwarded-Proto)", () => {
  it("builds an https OAuth redirect_uri when proxied over http", async () => {
    const env = {
      ...makeEnv(),
      OAUTH_CLIENT_ID: "cid",
      OAUTH_CLIENT_SECRET: "csecret",
      SESSION_SECRET: "sess",
      ALLOWED_ORIGIN: "https://example.test",
    } as unknown as Env;
    // The container sees http (TLS terminated at the proxy); the proxy forwards https.
    const res = await worker.fetch(
      new Request(
        "http://api.test/auth/login?provider=github&return=https://example.test/",
        {
          headers: { "X-Forwarded-Proto": "https" },
        },
      ),
      env,
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://api.test/auth/callback");
  });
});

describe("GET /link-graph", () => {
  it("builds the graph from content and flags wanted + redirects", async () => {
    stubGitHub();
    const res = await worker.fetch(req("/link-graph"), makeEnv());
    expect(res.status).toBe(200);
    // Shared-cache hint for a CDN in front (PERF-4); never on the browser's SHA.
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    const g = (await res.json()) as LinkGraph;
    expect(g.backlinks["getting-started"]).toEqual(["index"]);
    expect(g.wanted).toEqual([{ slug: "missing-page", by: ["index"] }]);
    expect(g.redirects).toEqual([
      { from: "getting-started", to: "index", broken: false, double: false },
    ]);
  });

  it("does not set a shared-cache header on identity/freshness endpoints", async () => {
    stubGitHub();
    const res = await worker.fetch(req("/whoami"), makeEnv());
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});

describe("GET /search-index", () => {
  it("returns plain-text docs for each page", async () => {
    stubGitHub();
    const res = await worker.fetch(req("/search-index"), makeEnv());
    const { docs } = (await res.json()) as {
      docs: { slug: string; title: string; text: string }[];
    };
    const home = docs.find((d) => d.slug === "index");
    expect(home?.title).toBe("Home");
    expect(home?.text).toContain("See getting-started and missing-page.");
  });
});

describe("GET /config (owner-editable wiki config)", () => {
  it("reads wikigit.json from the repo and returns the sanitized config", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      if (String(input).includes("/contents/wikigit.json")) {
        return Response.json({
          sha: "c",
          content: btoa(JSON.stringify({ title: "Acme", junk: 1 })),
        });
      }
      throw new Error(`unexpected fetch: ${input}`);
    });
    const res = await worker.fetch(req("/config"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    expect((await res.json()) as { config: unknown }).toEqual({
      config: { title: "Acme" },
    });
  });

  it("returns an empty config when the file is absent", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const res = await worker.fetch(req("/config"), makeEnv());
    expect((await res.json()) as { config: unknown }).toEqual({ config: {} });
  });
});

describe("GET /resolve + /tenant-available (tenant registry)", () => {
  // Seed the registry read-cache so resolution needs no GitHub call.
  function platformEnv(): Env {
    const env = makeEnv() as Env & {
      RATE_LIMIT: ReturnType<typeof fakeKV>;
      PLATFORM_HOST: string;
    };
    env.PLATFORM_HOST = "wikigit.org";
    env.RATE_LIMIT.put(
      "registry:raw",
      JSON.stringify({
        name: "recipes",
        repo: "bob/cookbook",
        owner: "gh:bob",
        lane: "byo",
        at: "t",
      }),
    );
    return env;
  }

  it("resolves a registered subdomain to its repo (with a shared-cache hint)", async () => {
    const res = await worker.fetch(
      req("/resolve?host=recipes.wikigit.org"),
      platformEnv(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    expect(await res.json()).toEqual({
      name: "recipes",
      repo: "bob/cookbook",
      lane: "byo",
    });
  });

  it("404s an unregistered subdomain so the frontend can offer to claim it", async () => {
    const res = await worker.fetch(
      req("/resolve?host=ghost.wikigit.org"),
      platformEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("reports name availability (taken / reserved / free)", async () => {
    const taken = await worker.fetch(
      req("/tenant-available?name=recipes"),
      platformEnv(),
    );
    expect((await taken.json()) as { available: boolean }).toMatchObject({
      available: false,
      reason: "taken",
    });
    const free = await worker.fetch(req("/tenant-available?name=fresh"), platformEnv());
    expect((await free.json()) as { available: boolean }).toMatchObject({
      available: true,
    });
  });
});
