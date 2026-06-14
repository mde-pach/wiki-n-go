import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession } from "./identity/auth";
import worker from "./index";
import type { LinkGraph } from "./indexlib";

const TEST_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBALVh4ios5EUmPMWZh4q0Yb/bLxhoG9UTq4WzNtXVHq8wOf1USuzW
lc0TKIGmNTqPr+Fh66Qir56ofAABbdCQF+cCAwEAAQJBAKaOX7QCzQqCdkOtG73O
rgQTLUfoMcaT7Wk0jCIHNcn/nygpnnj8WjUaK+012g10pO2dOlorHt0Etrdfwxwm
3eECIQDcSIcwni8TUTXeOGhWXmRo7x9X8FsGqTEPeUSTnDcwDQIhANLKqbdQ+TSD
GC1G79/DyozamWQLSPURsnx8kZ9DQvbDAiBIkKfgLyvIzEbXhnNwiDXBj4wetvH1
dsTPmR4rFhnj/QIhAJ+IQmo7HmBf1yxtQ55W0DVKPE07PTw86JjOrmeawFOBAiB9
DJPdlG5QQzgJkaj/LtI377B/tWYOuCEzTRtzak7kiQ==
-----END RSA PRIVATE KEY-----`;

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

describe("POST /claim (create a wiki, open self-serve)", () => {
  function claimEnv() {
    const env = makeEnv() as Env & {
      RATE_LIMIT: ReturnType<typeof fakeKV>;
      SESSION_SECRET: string;
      PLATFORM_HOST: string;
      PLATFORM_ORG: string;
      GITHUB_PLATFORM_APP_ID: string;
      GITHUB_PLATFORM_APP_PRIVATE_KEY: string;
    };
    env.SESSION_SECRET = "sess";
    env.PLATFORM_HOST = "wikigit.org";
    env.PLATFORM_ORG = "wikigit-tenants";
    env.GITHUB_PLATFORM_APP_ID = "999";
    env.GITHUB_PLATFORM_APP_PRIVATE_KEY = TEST_PEM;
    env.RATE_LIMIT.put("registry:raw", ""); // empty registry → name free
    return env;
  }
  const claimReq = (body: object, token?: string) =>
    new Request("https://w.dev/claim", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it("401s when not signed in", async () => {
    const res = await worker.fetch(
      claimReq({ name: "recipes", lane: "platform" }),
      claimEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("409s a reserved name", async () => {
    const token = await signSession("sess", { login: "alice", id: 1, avatar: "" });
    const res = await worker.fetch(
      claimReq({ name: "api", lane: "platform" }, token),
      claimEnv(),
    );
    expect(res.status).toBe(409);
  });

  it("provisions a managed wiki and returns its subdomain url", async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/orgs/wikigit-tenants/installation"))
        return Response.json({ id: 7 });
      if (url.includes("/access_tokens"))
        return Response.json({ token: "t", expires_at: "2999-01-01T00:00:00Z" });
      if (url.endsWith("/orgs/wikigit-tenants/repos"))
        return new Response("{}", { status: 201 });
      if (url.includes("/contents/")) {
        return method === "GET"
          ? new Response("", { status: 404 }) // registry file absent → first write
          : new Response("{}", { status: 201 });
      }
      throw new Error(`unexpected ${url}`);
    });
    const token = await signSession("sess", { login: "alice", id: 1, avatar: "" });
    const res = await worker.fetch(
      claimReq({ name: "recipes", lane: "platform" }, token),
      claimEnv(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { url: string; repo: string }).toMatchObject({
      name: "recipes",
      repo: "wikigit-tenants/recipes",
      url: "https://recipes.wikigit.org",
    });
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
