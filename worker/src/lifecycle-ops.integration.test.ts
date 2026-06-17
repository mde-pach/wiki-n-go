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

const puts: {
  url: string;
  body: { content: string; sha?: string; message: string };
}[] = [];

function stubGitHub(files: Record<string, string>) {
  puts.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/contents/") && method === "PUT") {
      puts.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    }
    const m = url.match(/\/contents\/content\/(.+?)\.md\?/);
    if (m) {
      const raw = files[m[1]];
      return raw === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: "srcsha", content: btoa(raw) });
    }
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans.json / trusted-editors.json
    if (url.includes("/commits")) return new Response("[]"); // trust stats → 0 edits
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

const decode = (b64: string) => atob(b64);
const at = (frag: string) => puts.find((p) => p.url.includes(frag));

afterEach(() => vi.unstubAllGlobals());

describe("POST /merge", () => {
  it("writes the composed content to the target and a redirect at the source", async () => {
    stubGitHub({ a: "# A\n\nFrom A.", b: "# B\n\nFrom B." });
    const composed = "# B\n\nFrom B.\n\n## A\n\nFrom A.";
    const res = await worker.fetch(
      post("/merge", { from: "a", to: "b", content: composed }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: "a", to: "b" });

    expect(decode(at("/content/b.md")?.body.content ?? "")).toBe(composed);
    const stub = at("/content/a.md");
    expect(decode(stub?.body.content ?? "")).toContain("redirect: b");
    expect(stub?.body.sha).toBe("srcsha"); // overwrites the source
  });

  it("404s when the target page is missing", async () => {
    stubGitHub({ a: "# A" });
    const res = await worker.fetch(
      post("/merge", { from: "a", to: "b", content: "x" }),
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid source slug", async () => {
    stubGitHub({ b: "# B" });
    const res = await worker.fetch(
      post("/merge", { from: "../x", to: "b", content: "x" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /split", () => {
  it("creates the new page and writes back the trimmed source", async () => {
    stubGitHub({ big: "# Big\n\nIntro.\n\n## Section\n\nCarve me out." });
    const toContent = "---\nsplit_from: big\n---\n\n## Section\n\nCarve me out.";
    const fromContent = "# Big\n\nIntro.";
    const res = await worker.fetch(
      post("/split", { from: "big", to: "section", fromContent, toContent }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: "big", to: "section" });

    const created = at("/content/section.md");
    expect(decode(created?.body.content ?? "")).toBe(toContent);
    expect(created?.body.sha).toBeUndefined(); // a brand-new file
    const trimmed = at("/content/big.md");
    expect(decode(trimmed?.body.content ?? "")).toBe(fromContent);
    expect(trimmed?.body.sha).toBe("srcsha"); // updates the source
  });

  it("refuses to overwrite an existing target", async () => {
    stubGitHub({ big: "# Big", section: "# Already here" });
    const res = await worker.fetch(
      post("/split", { from: "big", to: "section", fromContent: "x", toContent: "y" }),
      makeEnv(),
    );
    expect(res.status).toBe(422);
  });

  it("404s when the source page is missing", async () => {
    stubGitHub({});
    const res = await worker.fetch(
      post("/split", {
        from: "ghost",
        to: "section",
        fromContent: "x",
        toContent: "y",
      }),
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });
});

describe("partial-ban enforcement on the source page", () => {
  it("blocks merging away a page in a banned subtree (gate is not just the target)", async () => {
    const anon = `anon-${await ipHash("s", "0.0.0.0")}`;
    vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      if (url.includes("/contents/") && method === "PUT")
        return Response.json({ commit: { sha: "x", html_url: "u" } });
      const m = url.match(/\/contents\/content\/(.+?)\.md\?/);
      if (m) return Response.json({ sha: "srcsha", content: btoa(`# ${m[1]}`) });
      // Partial ban scoped to "a" — the source — but NOT the target "b".
      if (url.includes("raw.githubusercontent.com") && url.includes("bans.json"))
        return Response.json([{ key: anon, paths: ["a"] }]);
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      if (url.includes("/commits")) return new Response("[]");
      throw new Error(`unexpected fetch: ${url}`);
    });
    const res = await worker.fetch(
      post("/merge", { from: "a", to: "b", content: "x" }),
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });
});
