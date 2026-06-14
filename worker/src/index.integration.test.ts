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
