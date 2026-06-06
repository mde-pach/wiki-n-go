import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

const puts: { url: string; method: string }[] = [];

// Current page blob SHA the contents API reports; the editor's matching base.
const CURRENT_SHA = "filesha";

function stubGitHub(files: Record<string, string>) {
  puts.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/contents/") && method === "PUT") {
      puts.push({ url, method });
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    }
    const m = url.match(/\/contents\/(.+?)(?:\?|$)/);
    if (m) {
      const raw = files[decodeURIComponent(m[1])];
      return raw === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: CURRENT_SHA, content: btoa(raw) });
    }
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans / trusted-editors / filters
    if (url.includes("/commits")) return new Response("[]"); // trust stats → 0 edits
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "t",
    HASH_SECRET: "s",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    DEFAULT_EDIT_TIER: "open",
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const edit = (body: unknown) =>
  new Request("https://w.dev/edit", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

describe("POST /edit conflict detection", () => {
  it("publishes when the base SHA matches the current page", async () => {
    stubGitHub({ "content/foo.md": "# Foo" });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited", baseSha: CURRENT_SHA }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { live: boolean }).live).toBe(true);
    expect(puts.some((p) => p.method === "PUT")).toBe(true);
  });

  it("rejects with 409 when the page changed since the base", async () => {
    stubGitHub({ "content/foo.md": "# Foo" });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited", baseSha: "staleblobsha" }),
      makeEnv(),
    );
    expect(res.status).toBe(409);
    expect(puts.some((p) => p.method === "PUT")).toBe(false); // never overwrites
  });

  it("rejects with 409 when the page was deleted since the base", async () => {
    stubGitHub({});
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited", baseSha: CURRENT_SHA }),
      makeEnv(),
    );
    expect(res.status).toBe(409);
  });

  it("skips the check when no base SHA is sent (back-compatible)", async () => {
    stubGitHub({ "content/foo.md": "# Foo" });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(puts.some((p) => p.method === "PUT")).toBe(true);
  });
});
