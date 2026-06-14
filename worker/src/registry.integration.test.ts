import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTenant, repointTenant, type Tenant } from "./registry";
import { MemoryKV } from "./store";
import type { Env } from "./types";

afterEach(() => vi.unstubAllGlobals());

const EXISTING = [
  JSON.stringify({
    name: "acme",
    repo: "wikigit-tenants/acme",
    owner: "gh:jane",
    lane: "platform",
    at: "t1",
  }),
].join("\n");

function env(): Env {
  return {
    REPO_OWNER: "op",
    REPO_NAME: "hub",
    BRANCH: "main",
    GITHUB_TOKEN: "tok", // PAT path → gh() needs no App JWT
    RATE_LIMIT: new MemoryKV(),
  } as unknown as Env;
}

// Stub the contents GET (current registry) + capture the PUT.
function stub(raw: string | null) {
  const puts: { content: string; message: string }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.includes(".wikigit/tenants.jsonl") && method === "GET") {
      return raw === null
        ? new Response("", { status: 404 })
        : Response.json({ sha: "s1", content: btoa(raw) });
    }
    if (url.includes(".wikigit/tenants.jsonl") && method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        content: string;
        message: string;
      };
      puts.push({ content: atob(body.content), message: body.message });
      return Response.json({ commit: { sha: "new" } });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return puts;
}

const by = { name: "bot", email: "bot@x" };
const t = (over: Partial<Tenant>): Tenant => ({
  name: "acme",
  repo: "jane/acme",
  owner: "gh:jane",
  lane: "byo",
  at: "t2",
  ...over,
});

describe("repointTenant", () => {
  it("appends a re-point line for an existing tenant (last write wins)", async () => {
    const puts = stub(EXISTING);
    await repointTenant(env(), t({ repo: "jane/acme" }), by);
    expect(puts).toHaveLength(1);
    expect(puts[0].content).toContain(EXISTING); // prior lines preserved
    expect(puts[0].content.trim().split("\n")).toHaveLength(2);
    expect(puts[0].content).toContain('"repo":"jane/acme"');
  });

  it("refuses to re-point a name that doesn't exist", async () => {
    stub(EXISTING);
    await expect(repointTenant(env(), t({ name: "ghost" }), by)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects a malformed repo", async () => {
    stub(EXISTING);
    await expect(
      repointTenant(env(), t({ repo: "no-slash" }), by),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("registerTenant still blocks duplicates", () => {
  it("409s when the name already exists", async () => {
    stub(EXISTING);
    await expect(
      registerTenant(env(), t({ name: "acme", lane: "platform" }), by),
    ).rejects.toMatchObject({ status: 409 });
  });
});
