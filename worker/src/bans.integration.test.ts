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
  bans: unknown[] | null; // null → bans.json 404 (never created)
  rawBans?: unknown[]; // what the CDN hot-path returns (defaults to bans)
}

function stubGitHub(o: Opts) {
  puts.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/contents/") && method === "PUT") {
      puts.push({ url, method, body: JSON.parse(String(init.body)) });
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    }
    if (url.includes("/contents/bans.json"))
      return o.bans === null
        ? new Response("", { status: 404 })
        : Response.json({ sha: "bansha", content: btoa(JSON.stringify(o.bans)) });
    if (url.includes("/contents/audit-log.jsonl"))
      return new Response("", { status: 404 }); // none yet → created on first write
    if (url.includes("trusted-editors.json"))
      return Response.json(o.maintainer ? [o.maintainer] : []);
    if (url.includes("raw.githubusercontent.com") && url.includes("bans.json"))
      return Response.json(o.rawBans ?? o.bans ?? []);
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans.json etc.
    if (url.includes("/commits")) return new Response("[]"); // trust stats
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

afterEach(() => vi.unstubAllGlobals());

describe("POST /ban", () => {
  it("appends a path-scoped ban and writes an audit entry", async () => {
    stubGitHub({ maintainer: await anonName(), bans: [] });
    const res = await worker.fetch(
      post("/ban", { key: "anon-bad", paths: ["docs"], reason: "spam" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);

    const bansPut = puts.find((p) => p.url.includes("/contents/bans.json"));
    const written = JSON.parse(decode(String(bansPut?.body.content)));
    expect(written).toEqual([
      {
        key: "anon-bad",
        paths: ["docs"],
        reason: "spam",
        by: await anonName(),
        at: expect.any(String),
      },
    ]);
    expect(puts.some((p) => p.url.includes("audit-log.jsonl"))).toBe(true);
  });

  it("replaces an existing ban for the same key", async () => {
    stubGitHub({ maintainer: await anonName(), bans: ["anon-bad"] });
    await worker.fetch(post("/ban", { key: "anon-bad", paths: ["docs"] }), makeEnv());
    const written = JSON.parse(
      decode(
        String(puts.find((p) => p.url.includes("/contents/bans.json"))?.body.content),
      ),
    );
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ key: "anon-bad", paths: ["docs"] });
  });

  it("rejects a non-maintainer", async () => {
    stubGitHub({ maintainer: null, bans: [] });
    const res = await worker.fetch(post("/ban", { key: "anon-bad" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("rejects a missing key", async () => {
    stubGitHub({ maintainer: await anonName(), bans: [] });
    const res = await worker.fetch(post("/ban", { key: "" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("rejects an expiry in the past (would create an already-lifted ban)", async () => {
    stubGitHub({ maintainer: await anonName(), bans: [] });
    const res = await worker.fetch(
      post("/ban", { key: "anon-bad", expires: "2000-01-01T00:00:00Z" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(puts.some((p) => p.url.includes("/contents/bans.json"))).toBe(false);
  });
});

describe("POST /unban", () => {
  it("removes the ban and 404s when absent", async () => {
    stubGitHub({ maintainer: await anonName(), bans: ["anon-bad"] });
    const ok = await worker.fetch(post("/unban", { key: "anon-bad" }), makeEnv());
    expect(ok.status).toBe(200);
    const written = JSON.parse(
      decode(
        String(puts.find((p) => p.url.includes("/contents/bans.json"))?.body.content),
      ),
    );
    expect(written).toEqual([]);

    stubGitHub({ maintainer: await anonName(), bans: [] });
    const miss = await worker.fetch(post("/unban", { key: "ghost" }), makeEnv());
    expect(miss.status).toBe(404);
  });
});

describe("ban enforcement on /edit", () => {
  it("blocks a banned source from editing", async () => {
    stubGitHub({ maintainer: null, bans: ["anon-x"], rawBans: [await anonName()] });
    const res = await worker.fetch(
      post("/edit", { slug: "intro", content: "# hi", token: "t" }),
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });
});
