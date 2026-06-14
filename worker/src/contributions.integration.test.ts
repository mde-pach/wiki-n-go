import { afterEach, describe, expect, it, vi } from "vitest";
import { userPageOwner } from "./handlers/content";
import worker, { signSession } from "./index";

type Env = Parameters<typeof worker.fetch>[1];

const SESSION_SECRET = "session-secret";

// A signed-in identity = a valid HS256 session JWT replayed as a bearer token
// (cross-origin, so not a cookie). Mirrors the real OAuth-minted session.
async function bearer(login: string): Promise<string> {
  const jwt = await signSession(SESSION_SECRET, { login, id: 1, avatar: "" });
  return `Bearer ${jwt}`;
}

// The full GitHub publish flow (branch/commit/PR/merge) for an owner edit that
// goes live, plus the trust + bans + page-fetch reads. Modelled on the publish
// integration stub. `pageMissing` → the profile page doesn't exist yet.
function stubPublish(pageMissing = true) {
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes("/pulls/") && url.endsWith("/merge"))
      return Response.json({ sha: "mergesha", merged: true });
    if (url.includes("/pulls?") && method === "GET") return Response.json([]);
    if (url.endsWith("/pulls") && method === "POST")
      return Response.json({ number: 7, html_url: "https://pr.example/7" });
    if (url.endsWith("/git/refs") && method === "POST") return Response.json({});
    if (url.includes("/git/refs/heads/") && method === "DELETE")
      return new Response(null, { status: 204 });
    if (url.includes("/git/ref/heads/")) {
      if (url.endsWith("/heads/main"))
        return Response.json({ object: { sha: "basesha" } });
      return new Response("", { status: 404 }); // author branch absent
    }
    if (url.includes("/contents/") && method === "PUT")
      return Response.json({ commit: { sha: "branchsha" } });
    if (url.includes("/contents/"))
      return pageMissing
        ? new Response("", { status: 404 })
        : Response.json({ sha: "filesha", content: btoa("# old") });
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans / trusted-editors / filters
    if (url.includes("/commits")) return new Response("[]"); // trust → open
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
}

async function drain(res: Response): Promise<{ live?: boolean; prUrl?: string }> {
  const lines = (await res.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; result?: { live: boolean } });
  return lines.find((l) => l.type === "done")?.result ?? {};
}

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
    POW_BITS: "0",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    DEFAULT_EDIT_TIER: "open",
    SESSION_SECRET,
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

function editReq(body: unknown, auth?: string): Request {
  return new Request("https://w.dev/edit", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
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

  it("queries anon contributions by the no-PII email, not the bare name (WB-1)", async () => {
    let listAuthor: string | undefined;
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/commits/a1"))
        return Response.json({
          stats: { additions: 5, deletions: 0 },
          files: [{ filename: "content/tea.md", status: "added" }],
        });
      if (url.includes("/commits?author=") && url.includes("per_page=50")) {
        listAuthor = new URL(url).searchParams.get("author") ?? undefined;
        return Response.json([
          {
            sha: "a1",
            parents: [],
            commit: {
              author: { name: "anon-3f9a2c", date: "2026-06-02T00:00:00Z" },
              message: "Add tea",
            },
          },
        ]);
      }
      if (url.includes("/commits?author=")) return new Response("[]"); // trust → open
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await worker.fetch(
      new Request("https://w.dev/contributions?author=anon-3f9a2c", {
        headers: { Origin: "https://example.test" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isAnon: boolean; contributions: unknown[] };
    // The list must be filtered by the author's email, not its name — else it's
    // empty for anon while the tier (email-based) is non-zero.
    expect(listAuthor).toBe("anon-3f9a2c@anon.invalid");
    expect(body.isAnon).toBe(true);
    expect(body.contributions).toHaveLength(1);
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
  const page = { slug: "user/alice", content: "# Alice\n\nhi" };

  it("refuses an anonymous edit to someone's profile page", async () => {
    stubPublish();
    const res = await worker.fetch(editReq(page), makeEnv());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/owner/);
  });

  it("refuses a signed-in user editing someone *else's* profile page", async () => {
    stubPublish();
    const res = await worker.fetch(editReq(page, await bearer("bob")), makeEnv());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/owner/);
  });

  it("lets the owner edit their own page, and it publishes live", async () => {
    stubPublish();
    const res = await worker.fetch(editReq(page, await bearer("alice")), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("ndjson"); // not a 4xx rejection
    expect((await drain(res)).live).toBe(true);
  });

  it("matches the owner case-insensitively (GitHub logins fold case)", async () => {
    stubPublish();
    const res = await worker.fetch(editReq(page, await bearer("Alice")), makeEnv());
    expect(res.status).toBe(200);
    expect((await drain(res)).live).toBe(true);
  });

  it("refuses even a maintainer editing someone else's profile (owner-only)", async () => {
    stubPublish();
    // REPO_OWNER "o" signs in → maintainer, but profiles aren't his to rewrite;
    // moderation goes through delete/rollback, not the edit path.
    const res = await worker.fetch(editReq(page, await bearer("o")), makeEnv());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/owner/);
  });

  it("lets a maintainer edit their *own* profile page", async () => {
    stubPublish();
    const res = await worker.fetch(
      editReq({ slug: "user/o", content: "# Me" }, await bearer("o")),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect((await drain(res)).live).toBe(true);
  });
});
