import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

// A suppressed author must never reach a public feed. These endpoints (/pending,
// /topics, /topic) are unauthenticated, so redaction has to happen in the Worker
// before the data leaves it — same contract as /changes and /history.
const SUPPRESS_OCTOCAT = [{ type: "author", value: "octocat" }];

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
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

function get(path: string): Request {
  return new Request(`https://w.dev${path}`, {
    headers: { Origin: "https://example.test" },
  });
}

// Route the suppression list to every read path; everything else is per-test.
function stubSuppressions(suppressions: unknown) {
  return (url: string): Response | null =>
    url.includes("suppressed.json") ? Response.json(suppressions) : null;
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /pending redaction", () => {
  it("hides a suppressed author but leaves edit content (title) intact", async () => {
    const supp = stubSuppressions([{ type: "author", value: "anon-vandal" }]);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const s = supp(url);
      if (s) return s;
      if (url.includes("/graphql"))
        return Response.json({
          data: {
            repository: {
              pullRequests: {
                nodes: [
                  {
                    number: 5,
                    title: "Edit to coffee",
                    createdAt: "2026-06-01T00:00:00Z",
                    headRefName: "anon-vandal/coffee",
                    files: {
                      nodes: [
                        { path: "content/coffee.md", additions: 3, deletions: 1 },
                      ],
                    },
                  },
                ],
              },
            },
          },
        });
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await worker.fetch(get("/pending"), makeEnv());
    expect(res.status).toBe(200);
    const { pending } = (await res.json()) as {
      pending: { author: string; isAnon: boolean; title: string }[];
    };
    expect(pending[0].author).toBe("[suppressed]");
    expect(pending[0].isAnon).toBe(true);
    expect(pending[0].title).toBe("Edit to coffee"); // content is not a label
  });
});

describe("GET /topics redaction", () => {
  it("hides a suppressed author's pseudonym and avatar, leaving others untouched", async () => {
    const supp = stubSuppressions(SUPPRESS_OCTOCAT);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const s = supp(url);
      if (s) return s;
      if (url.includes("/graphql")) {
        const node = (body: string, login: string) => ({
          id: `id-${login}`,
          title: `talk:coffee · Topic by ${login}`,
          body,
          createdAt: "2026-06-01T00:00:00Z",
          author: { login: "bot", avatarUrl: "x" },
          comments: { totalCount: 0, nodes: [] },
        });
        return Response.json({
          data: {
            search: {
              nodes: [
                node("<!-- gh:octocat|https://a/o.png -->\n\nhi", "octocat"),
                node("<!-- anon:anon-ok -->\n\nhi", "anon-ok"),
              ],
            },
          },
        });
      }
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await worker.fetch(get("/topics?slug=coffee"), makeEnv());
    expect(res.status).toBe(200);
    const { topics } = (await res.json()) as {
      topics: { author: string; avatarUrl: string | null }[];
    };
    const suppressed = topics.find((t) => t.author === "[suppressed]");
    expect(suppressed).toBeDefined();
    expect(suppressed?.avatarUrl).toBeNull(); // avatar would de-anonymize
    expect(topics.some((t) => t.author === "anon-ok")).toBe(true); // others untouched
  });
});

describe("GET /topic redaction", () => {
  it("redacts a suppressed author on both the root and its replies", async () => {
    const supp = stubSuppressions(SUPPRESS_OCTOCAT);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const s = supp(url);
      if (s) return s;
      if (url.includes("/graphql"))
        return Response.json({
          data: {
            node: {
              id: "T1",
              title: "talk:coffee · Thread",
              body: "<!-- gh:octocat|https://a/o.png -->\n\nroot",
              bodyHTML: "<p>root</p>",
              createdAt: "2026-06-01T00:00:00Z",
              url: "https://gh/1",
              author: { login: "bot", avatarUrl: "x" },
              comments: {
                nodes: [
                  {
                    id: "C1",
                    body: "<!-- gh:octocat|https://a/o.png -->\n\nreply",
                    bodyHTML: "<p>reply</p>",
                    createdAt: "2026-06-02T00:00:00Z",
                    url: "https://gh/2",
                    author: { login: "bot", avatarUrl: "x" },
                  },
                  {
                    id: "C2",
                    body: "<!-- anon:anon-ok -->\n\nreply2",
                    bodyHTML: "<p>reply2</p>",
                    createdAt: "2026-06-03T00:00:00Z",
                    url: "https://gh/3",
                    author: null,
                  },
                ],
              },
            },
          },
        });
      if (url.includes("raw.githubusercontent.com"))
        return new Response("", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await worker.fetch(get("/topic?id=T1"), makeEnv());
    expect(res.status).toBe(200);
    const thread = (await res.json()) as {
      root: { author: string; avatarUrl: string | null };
      comments: { author: string }[];
    };
    expect(thread.root.author).toBe("[suppressed]");
    expect(thread.root.avatarUrl).toBeNull();
    expect(thread.comments[0].author).toBe("[suppressed]"); // octocat reply
    expect(thread.comments[1].author).toBe("anon-ok"); // untouched
  });
});
