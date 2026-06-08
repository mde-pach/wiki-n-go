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

afterEach(() => vi.unstubAllGlobals());

describe("POST /move", () => {
  it("copies the page to the new slug and leaves a redirect stub", async () => {
    stubGitHub({ old: "# Old\n\nThe body." });
    const res = await worker.fetch(
      post("/move", { from: "old", to: "new" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: "old", to: "new" });

    const created = puts.find((p) => p.url.includes("/content/new.md"));
    const stub = puts.find((p) => p.url.includes("/content/old.md"));
    expect(atob(created?.body.content ?? "")).toBe("# Old\n\nThe body."); // content copied verbatim
    expect(atob(stub?.body.content ?? "")).toContain("redirect: new"); // redirect left behind
    expect(stub?.body.sha).toBe("srcsha"); // overwrites the original
  });

  it("refuses to overwrite an existing target", async () => {
    stubGitHub({ old: "# Old", new: "# Already here" });
    const res = await worker.fetch(
      post("/move", { from: "old", to: "new" }),
      makeEnv(),
    );
    expect(res.status).toBe(422);
  });

  it("rejects an invalid target slug", async () => {
    stubGitHub({ old: "# Old" });
    const res = await worker.fetch(
      post("/move", { from: "old", to: "../x" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
