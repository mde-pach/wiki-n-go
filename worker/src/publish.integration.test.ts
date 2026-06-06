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

const calls: { method: string; url: string }[] = [];

interface Opts {
  files?: Record<string, string>; // path (no repo prefix) → raw content
  mergeable?: boolean; // does PUT …/merge succeed (default true)
  branchExists?: boolean; // does the author's deterministic branch already exist
  existingPr?: boolean; // is there already an open PR for that branch
}

function stubGitHub(o: Opts = {}) {
  calls.length = 0;
  const mergeable = o.mergeable ?? true;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({ method, url });

    if (url.includes("/pulls/") && url.endsWith("/merge"))
      return mergeable
        ? Response.json({ sha: "mergesha", merged: true })
        : new Response("not mergeable", { status: 405 });
    if (url.includes("/pulls?") && method === "GET")
      return Response.json(
        o.existingPr ? [{ number: 7, html_url: "https://pr.example/7" }] : [],
      );
    if (url.endsWith("/pulls") && method === "POST")
      return Response.json({ number: 7, html_url: "https://pr.example/7" });
    if (url.endsWith("/git/refs") && method === "POST") return Response.json({});
    if (url.includes("/git/refs/heads/") && method === "DELETE")
      return new Response(null, { status: 204 });
    if (url.includes("/git/ref/heads/")) {
      if (url.endsWith("/heads/main"))
        return Response.json({ object: { sha: "basesha" } });
      return o.branchExists
        ? Response.json({ object: { sha: "branchsha" } })
        : new Response("", { status: 404 });
    }
    if (url.includes("/contents/") && method === "PUT")
      return Response.json({ commit: { sha: "branchsha" } });
    const m = url.match(/\/contents\/(.+?)(?:\?|$)/);
    if (m) {
      const raw = o.files?.[decodeURIComponent(m[1])];
      return raw === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: "filesha", content: btoa(raw) });
    }
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans / trusted-editors / filters
    if (url.includes("/commits")) return new Response("[]"); // trust stats → 0 edits
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
}

function makeEnv(defaultTier = "open"): Env {
  return {
    GITHUB_TOKEN: "t",
    HASH_SECRET: "s",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    DEFAULT_EDIT_TIER: defaultTier,
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
  } as unknown as Env;
}

const edit = (body: unknown) =>
  new Request("https://w.dev/edit", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const merged = () => calls.some((c) => c.method === "PUT" && c.url.endsWith("/merge"));
const branchDeleted = () =>
  calls.some((c) => c.method === "DELETE" && c.url.includes("/git/refs/heads/"));
const prCreated = () =>
  calls.some((c) => c.method === "POST" && c.url.endsWith("/pulls"));

// The publish phase streams NDJSON; collapse it to the terminal result plus the
// progress milestones emitted along the way.
async function drain(res: Response) {
  const lines = (await res.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; result?: EditResult; label?: string });
  return {
    progress: lines.filter((l) => l.type === "progress"),
    result: lines.find((l) => l.type === "done")?.result,
    error: lines.find((l) => l.type === "error"),
  };
}

type EditResult = { live: boolean; sha?: string; prUrl?: string };

afterEach(() => vi.unstubAllGlobals());

describe("POST /edit — PR-always with auto-merge", () => {
  it("streams progress, then squash-merges a trusted edit live", async () => {
    stubGitHub({ files: { "content/foo.md": "# Foo" } });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("ndjson");
    const { result, progress } = await drain(res);
    expect(progress.length).toBeGreaterThan(0); // milestones were emitted
    expect(progress.every((p) => typeof p.label === "string")).toBe(true);
    expect(result?.live).toBe(true);
    expect(result?.sha).toBe("mergesha");
    expect(merged()).toBe(true);
    expect(branchDeleted()).toBe(true); // tidy up after a clean merge
  });

  it("leaves the PR open for review when the merge conflicts", async () => {
    stubGitHub({ files: { "content/foo.md": "# Foo" }, mergeable: false });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited" }),
      makeEnv(),
    );
    const { result } = await drain(res);
    expect(result?.live).toBe(false); // degrades into the review queue
    expect(result?.prUrl).toBe("https://pr.example/7");
    expect(merged()).toBe(true); // merge was attempted…
    expect(branchDeleted()).toBe(false); // …but the branch survives for the human
  });

  it("an untrusted edit opens a PR and never attempts a merge", async () => {
    stubGitHub({ files: { "content/foo.md": "# Foo" } });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited" }),
      makeEnv("maintainer"), // page now needs maintainer; anon stays below it
    );
    const { result } = await drain(res);
    expect(result?.live).toBe(false);
    expect(result?.prUrl).toBe("https://pr.example/7");
    expect(merged()).toBe(false);
  });

  it("is an idempotent no-op (plain JSON, no stream) when content is unchanged", async () => {
    stubGitHub({ files: { "content/foo.md": "# Foo" } });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo" }), // identical to live
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("json");
    expect(((await res.json()) as { live: boolean }).live).toBe(true);
    expect(prCreated()).toBe(false); // no empty PR
    expect(merged()).toBe(false);
  });

  it("reuses the author's existing open PR instead of stacking a new one", async () => {
    stubGitHub({
      files: { "content/foo.md": "# Foo" },
      branchExists: true,
      existingPr: true,
    });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo edited again" }),
      makeEnv(),
    );
    const { result } = await drain(res);
    expect(result?.live).toBe(true);
    expect(prCreated()).toBe(false); // reused, not duplicated
    expect(merged()).toBe(true);
  });
});
