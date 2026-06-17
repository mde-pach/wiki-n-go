import { afterEach, describe, expect, it, vi } from "vitest";
import { keyFromCommitEmail } from "./notify";
import { revertCommit } from "./revert";
import type { Env } from "./types";

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    _map: m,
  };
}

const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];

interface CommitFile {
  filename: string;
}

interface Opts {
  files: CommitFile[];
  parentSha?: string; // omit for a root commit (no parent → page deleted)
  authorEmail?: string;
  // Per-content-path raw text: `parent` is the pre-commit state (null = the
  // commit created the page), `branch` is the current live state.
  pages: Record<string, { parent?: string | null; branch?: string | null }>;
}

function stubGitHub(o: Opts) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (/\/commits\/[^/]+$/.test(url) && method === "GET")
      return Response.json({
        parents: o.parentSha ? [{ sha: o.parentSha }] : [],
        files: o.files,
        commit: { author: { email: o.authorEmail ?? "" } },
      });
    if (url.includes("/contents/") && (method === "PUT" || method === "DELETE"))
      return Response.json({ commit: { sha: "newsha" } });
    const m = url.match(/\/contents\/(.+?)\?ref=(.+)$/);
    if (m && method === "GET") {
      const path = decodeURIComponent(m[1]);
      const ref = decodeURIComponent(m[2]);
      const page = o.pages[path];
      const raw = ref === "main" ? page?.branch : page?.parent;
      return raw == null
        ? new Response("", { status: 404 })
        : Response.json({ sha: `${path}@${ref}`, content: btoa(raw) });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
}

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "t",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const BY = { name: "jane", email: "jane@maintainer.test" };

const putFor = (path: string) =>
  calls.find((c) => c.method === "PUT" && c.url.includes(`/contents/${path}`));
const deleteFor = (path: string) =>
  calls.find((c) => c.method === "DELETE" && c.url.includes(`/contents/${path}`));

afterEach(() => vi.unstubAllGlobals());

describe("revertCommit", () => {
  it("restores each page of a multi-page commit to its parent-state content", async () => {
    stubGitHub({
      parentSha: "parentsha",
      files: [{ filename: "content/a.md" }, { filename: "content/b.md" }],
      pages: {
        "content/a.md": { parent: "old A", branch: "vandalized A" },
        "content/b.md": { parent: "old B", branch: "vandalized B" },
      },
    });
    const { restored, revertedKey } = await revertCommit(makeEnv(), "sha123", BY);

    expect(restored).toEqual(["a", "b"]);
    expect(revertedKey).toBeNull();
    expect(atob(String(putFor("content/a.md")?.body?.content))).toBe("old A");
    expect(atob(String(putFor("content/b.md")?.body?.content))).toBe("old B");
    expect(putFor("content/a.md")?.body?.author).toEqual(BY);
    expect(deleteFor("content/a.md")).toBeUndefined();
  });

  it("deletes the page when the reverted commit had no parent (root commit)", async () => {
    stubGitHub({
      files: [{ filename: "content/new.md" }],
      pages: { "content/new.md": { branch: "created by root commit" } },
    });
    const { restored } = await revertCommit(makeEnv(), "rootsha", BY);

    expect(restored).toEqual(["new"]);
    expect(putFor("content/new.md")).toBeUndefined();
    const del = deleteFor("content/new.md");
    expect(del).toBeDefined();
    expect(del?.body?.author).toEqual(BY);
  });

  it("ignores non-content files in the commit", async () => {
    stubGitHub({
      parentSha: "parentsha",
      files: [
        { filename: "content/page.md" },
        { filename: "README.md" },
        { filename: "content/notes.txt" },
        { filename: "config/filters.json" },
      ],
      pages: { "content/page.md": { parent: "before", branch: "after" } },
    });
    const { restored } = await revertCommit(makeEnv(), "sha", BY);

    expect(restored).toEqual(["page"]);
    expect(calls.some((c) => c.url.includes("/contents/README.md"))).toBe(false);
    expect(calls.some((c) => c.url.includes("notes.txt"))).toBe(false);
  });

  it("throws 400 when the commit touched no content pages", async () => {
    stubGitHub({
      parentSha: "parentsha",
      files: [{ filename: "README.md" }],
      pages: {},
    });
    await expect(revertCommit(makeEnv(), "sha", BY)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("recovers the reverted author's key from a GitHub commit email", async () => {
    stubGitHub({
      parentSha: "parentsha",
      authorEmail: "1234+octocat@users.noreply.github.com",
      files: [{ filename: "content/a.md" }],
      pages: { "content/a.md": { parent: "old", branch: "new" } },
    });
    const { revertedKey } = await revertCommit(makeEnv(), "sha", BY);
    expect(revertedKey).toBe("gh:octocat");
  });

  it("recovers the reverted author's key from a Wikigit commit email", async () => {
    stubGitHub({
      parentSha: "parentsha",
      authorEmail: "wg-abc123@users.wikigit.invalid",
      files: [{ filename: "content/a.md" }],
      pages: { "content/a.md": { parent: "old", branch: "new" } },
    });
    const { revertedKey } = await revertCommit(makeEnv(), "sha", BY);
    expect(revertedKey).toBe("wg:abc123");
  });

  it("yields a null reverted key for a malformed/missing commit email", async () => {
    stubGitHub({
      parentSha: "parentsha",
      authorEmail: "anon-deadbeef@anon.invalid",
      files: [{ filename: "content/a.md" }],
      pages: { "content/a.md": { parent: "old", branch: "new" } },
    });
    const { revertedKey } = await revertCommit(makeEnv(), "sha", BY);
    expect(revertedKey).toBeNull();
  });
});

describe("keyFromCommitEmail", () => {
  it("maps the bare (legacy) GitHub no-reply form", () => {
    expect(keyFromCommitEmail("octocat@users.noreply.github.com")).toBe("gh:octocat");
  });

  it("maps the id-prefixed GitHub no-reply form", () => {
    expect(keyFromCommitEmail("99+octocat@users.noreply.github.com")).toBe(
      "gh:octocat",
    );
  });

  it("maps a Wikigit writer email", () => {
    expect(keyFromCommitEmail("wg-sub-1@users.wikigit.invalid")).toBe("wg:sub-1");
  });

  it("returns null for an anonymous or empty email", () => {
    expect(keyFromCommitEmail("anon-x@anon.invalid")).toBeNull();
    expect(keyFromCommitEmail("")).toBeNull();
  });
});
