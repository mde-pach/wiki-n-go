import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../identity/auth";
import { MemoryKV } from "../store";
import type { Env } from "../types";
import { addDomain, cnameExpected, cnameOk } from "./domain";

afterEach(() => vi.unstubAllGlobals());

const SECRET = "session-secret";
const REGISTRY = JSON.stringify({
  name: "recipes",
  repo: "bob/cookbook",
  owner: "gh:bob",
  lane: "byo",
  at: "t1",
});

function env(): Env {
  const kv = new MemoryKV();
  kv.put("registry:raw", REGISTRY);
  return {
    REPO_OWNER: "op",
    REPO_NAME: "hub",
    BRANCH: "main",
    PLATFORM_HOST: "wikigit.org",
    SESSION_SECRET: SECRET,
    GITHUB_TOKEN: "tok",
    RATE_LIMIT: kv,
  } as unknown as Env;
}

async function req(login: string | null): Promise<Request> {
  const headers = new Headers();
  if (login) {
    const jwt = await signSession(SECRET, { login, id: 1, avatar: "" });
    headers.set("Authorization", `Bearer ${jwt}`);
  }
  return new Request("https://api.wikigit.org/domain", { method: "POST", headers });
}

describe("cname helpers", () => {
  it("expects the tenant's platform host as the CNAME target", () => {
    expect(cnameExpected(env(), "recipes")).toBe("recipes.wikigit.org");
  });
  it("matches the target case- and trailing-dot-insensitively", () => {
    expect(cnameOk("Recipes.WikiGit.org.", "recipes.wikigit.org")).toBe(true);
    expect(cnameOk("elsewhere.example.com", "recipes.wikigit.org")).toBe(false);
    expect(cnameOk(null, "recipes.wikigit.org")).toBe(false);
  });
});

describe("addDomain guards", () => {
  it("rejects a malformed domain", async () => {
    await expect(
      addDomain(env(), await req("bob"), { name: "recipes", domain: "nope" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("requires a session", async () => {
    await expect(
      addDomain(env(), await req(null), { name: "recipes", domain: "wiki.bob.com" }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("forbids a non-owner", async () => {
    await expect(
      addDomain(env(), await req("eve"), { name: "recipes", domain: "wiki.bob.com" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("404s an unknown wiki", async () => {
    await expect(
      addDomain(env(), await req("bob"), { name: "ghost", domain: "wiki.bob.com" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("addDomain DNS verification", () => {
  function stub(cnameData: string | null, puts: string[]) {
    vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.includes("dns.google/resolve")) {
        return Response.json(
          cnameData ? { Answer: [{ type: 5, data: cnameData }] } : { Answer: [] },
        );
      }
      if (url.includes(".wikigit/tenants.jsonl")) {
        if ((init.method ?? "GET") === "GET")
          return Response.json({ sha: "s1", content: btoa(REGISTRY) });
        puts.push(atob(JSON.parse(String(init.body)).content));
        return Response.json({ commit: { sha: "n" } });
      }
      throw new Error(`unexpected ${url}`);
    });
  }

  it("rejects when the CNAME doesn't point at the platform host", async () => {
    stub("somewhere.else.com.", []);
    await expect(
      addDomain(env(), await req("bob"), { name: "recipes", domain: "wiki.bob.com" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("records the domain when the CNAME verifies", async () => {
    const puts: string[] = [];
    stub("recipes.wikigit.org.", puts);
    const r = await addDomain(env(), await req("bob"), {
      name: "recipes",
      domain: "wiki.bob.com",
    });
    expect(r).toMatchObject({
      ok: true,
      domain: "wiki.bob.com",
      url: "https://wiki.bob.com",
    });
    expect(puts[0]).toContain('"domain":"wiki.bob.com"');
  });
});
