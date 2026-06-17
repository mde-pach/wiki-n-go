import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { ipHash } from "./index";

type Env = Parameters<typeof worker.fetch>[1];

// The /review merge path is the one maintainer action that lands a PR on the live
// branch; isInSiteRef() is what stops a maintainer being tricked into merging an
// arbitrary attacker-opened PR by number. These exercise both.

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

const calls: { method: string; url: string }[] = [];

interface Opts {
  maintainer: boolean;
  ref: string; // the PR's head.ref
}

function stubGitHub(o: Opts, anon: string) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({ method, url });
    if (url.includes("trusted-editors.json"))
      return Response.json(o.maintainer ? [anon] : []);
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // wikigit.json etc.
    if (url.includes("/commits")) return new Response("[]"); // trust stats
    if (/\/pulls\/\d+$/.test(url.split("?")[0]) && method === "GET")
      return Response.json({ head: { ref: o.ref }, title: "Edit intro" });
    if (url.includes("/pulls/") && url.endsWith("/merge"))
      return Response.json({ sha: "mergesha", merged: true });
    if (url.includes("/git/refs/heads/") && method === "DELETE")
      return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch: ${method} ${url}`);
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

const post = (body: unknown) =>
  new Request("https://w.dev/review", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const anonName = () => ipHash("s", "0.0.0.0").then((h) => `anon-${h}`);

afterEach(() => vi.unstubAllGlobals());

describe("POST /review (merge to live)", () => {
  it("merges an in-site PR and deletes its branch", async () => {
    const anon = await anonName();
    stubGitHub({ maintainer: true, ref: `${anon}/intro` }, anon);
    const res = await worker.fetch(post({ number: 7, action: "merge" }), makeEnv());
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/merge"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.method === "DELETE" && c.url.includes("/git/refs/")),
    ).toBe(true);
  });

  it("rejects a non-maintainer", async () => {
    const anon = await anonName();
    stubGitHub({ maintainer: false, ref: `${anon}/intro` }, anon);
    const res = await worker.fetch(post({ number: 7, action: "merge" }), makeEnv());
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.url.endsWith("/merge"))).toBe(false);
  });

  it("refuses to merge a PR whose branch isn't an in-site edit ref", async () => {
    const anon = await anonName();
    stubGitHub({ maintainer: true, ref: "patch-1" }, anon); // attacker-opened PR
    const res = await worker.fetch(post({ number: 9, action: "merge" }), makeEnv());
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.url.endsWith("/merge"))).toBe(false);
  });

  it("rejects an invalid action", async () => {
    const anon = await anonName();
    stubGitHub({ maintainer: true, ref: `${anon}/intro` }, anon);
    const res = await worker.fetch(post({ number: 7, action: "nuke" }), makeEnv());
    expect(res.status).toBe(400);
  });
});
