import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

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

const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];

interface Opts {
  old: string; // current/parent content of content/foo.md
  deletions?: number; // stats reported for the merged commit (drives the risk score)
  additions?: number;
}

const MERGE_SHA = "deadbee"; // valid hex so the commit-detail matcher catches it

function stubGitHub(o: Opts) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (url.includes("/pulls/") && url.endsWith("/merge"))
      return Response.json({ sha: MERGE_SHA, merged: true });
    if (url.includes("/pulls?") && method === "GET") return Response.json([]);
    if (url.endsWith("/pulls") && method === "POST")
      return Response.json({ number: 7, html_url: "https://pr.example/7" });
    if (url.endsWith("/git/refs") && method === "POST") return Response.json({});
    if (url.includes("/git/refs/heads/") && method === "DELETE")
      return new Response(null, { status: 204 });
    if (url.includes("/git/ref/heads/"))
      return url.endsWith("/heads/main")
        ? Response.json({ object: { sha: "basesha" } })
        : new Response("", { status: 404 });
    // Single-commit detail (merge sha): stats for the risk score + files/parent
    // for the revert. Both changeDetail and revertCommit read this shape.
    if (/\/commits\/[0-9a-f]{7,40}(?:\?|$)/.test(url))
      return Response.json({
        parents: [{ sha: "parentsha" }],
        stats: { additions: o.additions ?? 1, deletions: o.deletions ?? 0 },
        files: [{ filename: "content/foo.md", status: "modified" }],
      });
    if (url.includes("/contents/") && (method === "PUT" || method === "DELETE"))
      return Response.json({ commit: { sha: "newsha", html_url: "u" } });
    const m = url.match(/\/contents\/(.+?)(?:\?|$)/);
    if (m)
      return decodeURIComponent(m[1]) === "content/foo.md"
        ? Response.json({ sha: "filesha", content: btoa(o.old) })
        : new Response("", { status: 404 }); // audit-log.jsonl is appended fresh
    if (url.includes("raw.githubusercontent.com"))
      return new Response("", { status: 404 }); // bans / trusted-editors / filters
    if (url.includes("/commits")) return new Response("[]"); // trust stats → open tier
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
}

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    GITHUB_TOKEN: "t",
    HASH_SECRET: "s",
    REPO_OWNER: "o",
    REPO_NAME: "r",
    BRANCH: "main",
    CONTENT_DIR: "content",
    DEFAULT_EDIT_TIER: "open", // immediate-publish, so an anon edit auto-merges
    ALLOWED_ORIGIN: "https://example.test",
    RATE_LIMIT: fakeKV(),
    ...over,
  } as unknown as Env;
}

const edit = (body: unknown) =>
  new Request("https://w.dev/edit", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

type EditResult = { live: boolean; sha?: string; autoReverted?: boolean };

async function drain(res: Response) {
  const lines = (await res.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; result?: EditResult });
  return lines.find((l) => l.type === "done")?.result;
}

// The automoderator's revert: a PUT to the page on the live branch, authored by
// the bot, restoring the pre-edit content.
const autoRevertPut = () =>
  calls.find(
    (c) =>
      c.method === "PUT" &&
      c.url.includes("/contents/content/foo.md") &&
      c.body?.author != null &&
      (c.body.author as { name: string }).name === "automoderator",
  );
const auditAppended = () =>
  calls.some((c) => c.method === "PUT" && c.url.includes("/contents/audit-log.jsonl"));
const commitDetailFetched = () =>
  calls.some((c) => /\/commits\/[0-9a-f]{7,40}/.test(c.url));

afterEach(() => vi.unstubAllGlobals());

describe("automoderator — post-publish auto-revert", () => {
  it("reverts high-confidence vandalism after it auto-merges, and records it", async () => {
    stubGitHub({ old: "x".repeat(400), deletions: 300, additions: 1 });
    const env = makeEnv({ AUTOMOD_REVERT_SCORE: "70" });
    const res = await worker.fetch(edit({ slug: "foo", content: "blanked" }), env);
    const result = await drain(res);

    expect(result?.autoReverted).toBe(true);
    expect(result?.live).toBe(false); // it published, then the bot reverted it
    const put = autoRevertPut();
    expect(put).toBeDefined();
    expect(atob(String(put?.body?.content))).toBe("x".repeat(400)); // pre-edit content
    expect(put?.body?.branch).toBe("main");
    expect(auditAppended()).toBe(true);

    // The original change is tagged + the per-page cap counter advanced.
    const kv = (env.RATE_LIMIT as unknown as { _map: Map<string, string> })._map;
    expect(JSON.parse(kv.get(`tag:${MERGE_SHA}`) as string)).toContain("auto-reverted");
    expect(kv.get("automod:foo")).toBe("1");
  });

  it("does nothing when the automoderator is disabled (no threshold)", async () => {
    stubGitHub({ old: "x".repeat(400), deletions: 300, additions: 1 });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "blanked" }),
      makeEnv(),
    );
    const result = await drain(res);

    expect(result?.live).toBe(true);
    expect(result?.autoReverted).toBeFalsy();
    expect(autoRevertPut()).toBeUndefined();
    expect(commitDetailFetched()).toBe(false); // no scoring work at all
  });

  it("leaves a low-risk edit live even with the bot enabled", async () => {
    stubGitHub({ old: "# Foo", deletions: 0, additions: 3 });
    const res = await worker.fetch(
      edit({ slug: "foo", content: "# Foo plus a line" }),
      makeEnv({ AUTOMOD_REVERT_SCORE: "70" }),
    );
    const result = await drain(res);

    expect(result?.live).toBe(true);
    expect(result?.autoReverted).toBeFalsy();
    expect(autoRevertPut()).toBeUndefined();
  });

  it("backs off once the per-page revert cap is reached (no edit-war)", async () => {
    stubGitHub({ old: "x".repeat(400), deletions: 300, additions: 1 });
    const env = makeEnv({ AUTOMOD_REVERT_SCORE: "70", AUTOMOD_REVERT_CAP: "1" });
    (env.RATE_LIMIT as unknown as { _map: Map<string, string> })._map.set(
      "automod:foo",
      "1",
    );
    const res = await worker.fetch(
      edit({ slug: "foo", content: "blanked again" }),
      env,
    );
    const result = await drain(res);

    expect(result?.live).toBe(true); // cap hit → left for a human
    expect(result?.autoReverted).toBeFalsy();
    expect(autoRevertPut()).toBeUndefined();
  });
});
