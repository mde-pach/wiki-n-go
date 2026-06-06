import { afterEach, describe, expect, it, vi } from "vitest";
import { userPageOwner } from "./handlers/content";
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

afterEach(() => vi.unstubAllGlobals());

describe("userPageOwner", () => {
  it("extracts the login of a user-namespace page only", () => {
    expect(userPageOwner("user/alice")).toBe("alice");
    expect(userPageOwner("user/anon-3f9a2c")).toBe("anon-3f9a2c");
    expect(userPageOwner("user/alice/sub")).toBeNull();
    expect(userPageOwner("coffee")).toBeNull();
    expect(userPageOwner("users/alice")).toBeNull();
  });
});

describe("GET /contributions", () => {
  it("returns the author's content edits newest-first with byte deltas + tier", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/commits/c1"))
        return Response.json({
          stats: { additions: 12, deletions: 3 },
          files: [{ filename: "content/coffee.md", status: "modified" }],
        });
      if (url.includes("/commits?author=") && url.includes("per_page=50"))
        return Response.json([
          {
            sha: "c1",
            parents: [],
            commit: {
              author: { name: "alice", date: "2026-06-01T00:00:00Z" },
              message: "Improve coffee\n\nbody",
            },
          },
        ]);
      if (url.includes("/commits?author=")) return new Response("[]"); // trust count → 0
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await worker.fetch(
      new Request("https://w.dev/contributions?author=alice", {
        headers: { Origin: "https://example.test" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      login: string;
      tier: string;
      isAnon: boolean;
      contributions: { sha: string; slugs: string[]; additions: number }[];
    };
    expect(body.login).toBe("alice");
    expect(body.tier).toBe("open");
    expect(body.isAnon).toBe(false);
    expect(body.contributions).toHaveLength(1);
    expect(body.contributions[0]).toMatchObject({
      sha: "c1",
      slugs: ["coffee"],
      additions: 12,
      deletions: 3,
      message: "Improve coffee",
    });
  });

  it("rejects a malformed author", async () => {
    const res = await worker.fetch(
      new Request("https://w.dev/contributions?author=not%20a%20login", {
        headers: { Origin: "https://example.test" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /edit — user page ownership gate", () => {
  it("refuses an anonymous edit to someone's profile page", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      if (url.includes("/commits")) return new Response("[]"); // trust → open
      if (url.includes("/contents/")) return new Response("", { status: 404 }); // page absent
      throw new Error(`unexpected fetch: ${url}`);
    });
    const res = await worker.fetch(
      new Request("https://w.dev/edit", {
        method: "POST",
        headers: { Origin: "https://example.test", "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "user/alice", content: "# Alice\n\nhi" }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /owner or a maintainer/,
    );
  });
});
