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
  files: Record<string, string>; // slug → current/parent content
  commitFiles: string[]; // paths the rolled-back commit touched
  parent?: string | null;
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
    if (url.includes("/contents/audit-log.jsonl"))
      return new Response("", { status: 404 }); // appended after the rollback
    const m = url.match(/\/contents\/content\/(.+?)\.md\?/);
    if (m) {
      const raw = o.files[m[1]];
      return raw === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: "srcsha", content: btoa(raw) });
    }
    const commit = url.match(/\/commits\/([0-9a-f]{7,40})(?:\?|$)/);
    if (commit)
      return Response.json({
        parents: o.parent === null ? [] : [{ sha: o.parent ?? "parentsha" }],
        files: o.commitFiles.map((f) => ({ filename: f })),
      });
    if (url.includes("/commits")) return new Response("[]"); // trust stats list
    if (url.includes("trusted-editors.json"))
      return Response.json(o.maintainer ? [o.maintainer] : []);
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans.json
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

// The default caller is anonymous over ip 0.0.0.0; this is the pseudonym it
// resolves to, so the test can list it in trusted-editors.json.
const anonName = async () => `anon-${await ipHash("s", "0.0.0.0")}`;

afterEach(() => vi.unstubAllGlobals());

describe("POST /rollback", () => {
  it("restores a touched page to its pre-commit content", async () => {
    stubGitHub({
      maintainer: await anonName(),
      files: { intro: "# Intro\n\nRestored body." },
      commitFiles: ["content/intro.md"],
    });
    const res = await worker.fetch(post("/rollback", { sha: "abc1234" }), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, restored: ["intro"] });

    const put = puts.find((p) => p.method === "PUT");
    expect(atob(String(put?.body.content))).toBe("# Intro\n\nRestored body.");
    expect(put?.body.sha).toBe("srcsha"); // overwrites the current blob
  });

  it("deletes a page the commit created (absent at the parent)", async () => {
    stubGitHub({
      maintainer: await anonName(),
      files: { intro: "# Intro" }, // present on the branch, but the parent 404s
      commitFiles: ["content/intro.md"],
      parent: null, // root commit → nothing existed before
    });
    const res = await worker.fetch(post("/rollback", { sha: "abc1234" }), makeEnv());
    expect(res.status).toBe(200);
    expect(puts.find((p) => p.method === "DELETE")?.body.sha).toBe("srcsha");
  });

  it("rejects a non-maintainer", async () => {
    stubGitHub({
      maintainer: null,
      files: { intro: "# Intro" },
      commitFiles: ["content/intro.md"],
    });
    const res = await worker.fetch(post("/rollback", { sha: "abc1234" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("rejects a commit with no content files", async () => {
    stubGitHub({
      maintainer: await anonName(),
      files: {},
      commitFiles: ["README.md"],
    });
    const res = await worker.fetch(post("/rollback", { sha: "abc1234" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("rejects an invalid revision", async () => {
    stubGitHub({ maintainer: await anonName(), files: {}, commitFiles: [] });
    const res = await worker.fetch(post("/rollback", { sha: "nothex!" }), makeEnv());
    expect(res.status).toBe(400);
  });
});
