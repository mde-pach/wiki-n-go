import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { ipHash } from "./index";

type Env = Parameters<typeof worker.fetch>[1];

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    _map: m,
  };
}

const puts: { url: string; body: Record<string, unknown> }[] = [];

interface Opts {
  maintainer: string | null;
  rev?: string;
  atRev?: string; // content at the requested rev
  current?: string | null; // content on the live branch
  commitSha?: string; // latest commit for patrol-status
}

function stubGitHub(o: Opts) {
  puts.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/contents/") && method === "PUT") {
      puts.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    }
    if (url.includes("/contents/audit-log.jsonl"))
      return new Response("", { status: 404 }); // created on first audit write
    const file = url.match(/\/contents\/content\/.+?\.md\?ref=([^&]+)/);
    if (file) {
      const raw = file[1] === o.rev ? o.atRev : o.current;
      return raw == null
        ? new Response("", { status: 404 })
        : Response.json({
            sha: file[1] === o.rev ? "revsha" : "cursha",
            content: btoa(raw),
          });
    }
    if (url.includes("/commits?path="))
      return Response.json(o.commitSha ? [{ sha: o.commitSha }] : []);
    if (url.includes("/commits")) return new Response("[]"); // trust stats
    if (url.includes("trusted-editors.json"))
      return Response.json(o.maintainer ? [o.maintainer] : []);
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function makeEnv(kv = fakeKV()): Env {
  return {
    GITHUB_TOKEN: "t",
    HASH_SECRET: "s",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    DEFAULT_EDIT_TIER: "open",
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: kv,
  } as unknown as Env;
}

const post = (path: string, body: unknown) =>
  new Request(`https://w.dev${path}`, {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) =>
  new Request(`https://w.dev${path}`, { headers: { Origin: "https://example.test" } });

const anonName = async () => `anon-${await ipHash("s", "0.0.0.0")}`;
const decode = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

afterEach(() => vi.unstubAllGlobals());

describe("POST /restore", () => {
  it("writes the page's content at the chosen revision", async () => {
    stubGitHub({
      maintainer: await anonName(),
      rev: "abc1234",
      atRev: "# Old\n",
      current: "# New\n",
    });
    const res = await worker.fetch(
      post("/restore", { slug: "intro", rev: "abc1234" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const put = puts[0];
    expect(decode(String(put.body.content))).toBe("# Old\n");
    expect(put.body.sha).toBe("cursha"); // overwrites the live blob
  });

  it("rejects a non-maintainer and a bad revision", async () => {
    stubGitHub({ maintainer: null, rev: "abc1234", atRev: "x", current: "y" });
    expect(
      (
        await worker.fetch(
          post("/restore", { slug: "intro", rev: "abc1234" }),
          makeEnv(),
        )
      ).status,
    ).toBe(403);
    stubGitHub({ maintainer: await anonName() });
    expect(
      (await worker.fetch(post("/restore", { slug: "intro", rev: "zzz" }), makeEnv()))
        .status,
    ).toBe(400);
  });
});

describe("POST /protect", () => {
  it("sets the protection frontmatter field", async () => {
    stubGitHub({ maintainer: await anonName(), current: "# Intro\n\nBody.\n" });
    const res = await worker.fetch(
      post("/protect", { slug: "intro", tier: "extended" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(decode(String(puts[0].body.content))).toBe(
      "---\nprotection: extended\n---\n\n# Intro\n\nBody.\n",
    );
  });

  it("rejects an invalid tier", async () => {
    stubGitHub({ maintainer: await anonName(), current: "# Intro\n" });
    const res = await worker.fetch(
      post("/protect", { slug: "intro", tier: "superuser" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /tag", () => {
  it("merges a tag into the commit's KV set, preserving existing tags", async () => {
    stubGitHub({ maintainer: await anonName() });
    const kv = fakeKV();
    await kv.put("tag:abc1234", JSON.stringify(["edit-war"]));
    const res = await worker.fetch(
      post("/tag", { sha: "abc1234", tag: "spam" }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(kv._map.get("tag:abc1234") ?? "[]")).toEqual([
      "edit-war",
      "spam",
    ]);
  });

  it("rejects a non-maintainer and an invalid tag", async () => {
    stubGitHub({ maintainer: null });
    expect(
      (await worker.fetch(post("/tag", { sha: "abc1234", tag: "spam" }), makeEnv()))
        .status,
    ).toBe(403);
    stubGitHub({ maintainer: await anonName() });
    expect(
      (await worker.fetch(post("/tag", { sha: "abc1234", tag: "BAD TAG" }), makeEnv()))
        .status,
    ).toBe(400);
  });
});

describe("GET /patrol-status", () => {
  it("reports patrolled from the KV flag on the latest commit", async () => {
    stubGitHub({ maintainer: null, commitSha: "c1" });
    const kv = fakeKV();
    await kv.put("patrol:c1", "1");
    const res = await worker.fetch(get("/patrol-status?slug=intro"), makeEnv(kv));
    expect(await res.json()).toEqual({ patrolled: true, sha: "c1" });
  });

  it("reports unpatrolled when the flag is absent", async () => {
    stubGitHub({ maintainer: null, commitSha: "c1" });
    const res = await worker.fetch(get("/patrol-status?slug=intro"), makeEnv());
    expect(await res.json()).toEqual({ patrolled: false, sha: "c1" });
  });
});
