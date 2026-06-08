import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { ipHash } from "./index";

type Env = Parameters<typeof worker.fetch>[1];

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

const puts: { url: string; method: string; body: Record<string, unknown> }[] = [];

interface Opts {
  maintainer: string | null;
  files?: Record<string, string>; // path (no repo prefix) → raw content
}

function stubGitHub(o: Opts) {
  puts.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/contents/") && (method === "PUT" || method === "DELETE")) {
      puts.push({ url, method, body: JSON.parse(String(init.body)) });
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    }
    const m = url.match(/\/contents\/(.+?)(?:\?|$)/);
    if (m) {
      const raw = o.files?.[decodeURIComponent(m[1])];
      return raw === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: "filesha", content: btoa(raw) });
    }
    if (url.includes("trusted-editors.json"))
      return Response.json(o.maintainer ? [o.maintainer] : []);
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 });
    if (url.includes("/commits")) return new Response("[]");
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
    DEFAULT_EDIT_TIER: "open",
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const post = (path: string, body: unknown) =>
  new Request(`https://w.dev${path}`, {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const anonName = async () => `anon-${await ipHash("s", "0.0.0.0")}`;
const decode = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const bansPut = (frag: string) => puts.find((p) => p.url.includes(frag));

afterEach(() => vi.unstubAllGlobals());

describe("POST /delete", () => {
  it("removes the page file (maintainer)", async () => {
    stubGitHub({ maintainer: await anonName(), files: { "content/old.md": "# Old" } });
    const res = await worker.fetch(post("/delete", { slug: "old" }), makeEnv());
    expect(res.status).toBe(200);
    const del = puts.find((p) => p.method === "DELETE");
    expect(del?.url).toContain("/contents/content/old.md");
    expect(del?.body.sha).toBe("filesha");
  });
  it("404s a missing page and 403s a non-maintainer", async () => {
    stubGitHub({ maintainer: await anonName(), files: {} });
    expect(
      (await worker.fetch(post("/delete", { slug: "ghost" }), makeEnv())).status,
    ).toBe(404);
    stubGitHub({ maintainer: null, files: { "content/old.md": "# Old" } });
    expect(
      (await worker.fetch(post("/delete", { slug: "old" }), makeEnv())).status,
    ).toBe(403);
  });
});

describe("POST /grant + /revoke", () => {
  it("adds and removes a maintainer in trusted-editors.json", async () => {
    stubGitHub({ maintainer: await anonName(), files: {} });
    await worker.fetch(post("/grant", { key: "anon-friend" }), makeEnv());
    const granted = JSON.parse(
      decode(String(bansPut("trusted-editors.json")?.body.content)),
    );
    expect(granted).toContain("anon-friend");

    stubGitHub({
      maintainer: await anonName(),
      files: { "trusted-editors.json": JSON.stringify(["anon-friend"]) },
    });
    await worker.fetch(post("/revoke", { key: "anon-friend" }), makeEnv());
    expect(
      JSON.parse(decode(String(bansPut("trusted-editors.json")?.body.content))),
    ).toEqual([]);
  });
});

describe("POST /suppress", () => {
  it("writes a suppression entry (maintainer) and 403s others", async () => {
    stubGitHub({ maintainer: await anonName(), files: {} });
    const res = await worker.fetch(
      post("/suppress", { type: "author", value: "anon-bad", reason: "doxx" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const written = JSON.parse(
      decode(String(bansPut("suppressed.json")?.body.content)),
    );
    expect(written[0]).toMatchObject({
      type: "author",
      value: "anon-bad",
      reason: "doxx",
    });

    stubGitHub({ maintainer: null, files: {} });
    expect(
      (await worker.fetch(post("/suppress", { type: "author", value: "x" }), makeEnv()))
        .status,
    ).toBe(403);
  });
  it("rejects an invalid type", async () => {
    stubGitHub({ maintainer: await anonName(), files: {} });
    expect(
      (await worker.fetch(post("/suppress", { type: "ip", value: "x" }), makeEnv()))
        .status,
    ).toBe(400);
  });
});
