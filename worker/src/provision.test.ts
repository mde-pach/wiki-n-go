import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./types";

const PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBALVh4ios5EUmPMWZh4q0Yb/bLxhoG9UTq4WzNtXVHq8wOf1USuzW
lc0TKIGmNTqPr+Fh66Qir56ofAABbdCQF+cCAwEAAQJBAKaOX7QCzQqCdkOtG73O
rgQTLUfoMcaT7Wk0jCIHNcn/nygpnnj8WjUaK+012g10pO2dOlorHt0Etrdfwxwm
3eECIQDcSIcwni8TUTXeOGhWXmRo7x9X8FsGqTEPeUSTnDcwDQIhANLKqbdQ+TSD
GC1G79/DyozamWQLSPURsnx8kZ9DQvbDAiBIkKfgLyvIzEbXhnNwiDXBj4wetvH1
dsTPmR4rFhnj/QIhAJ+IQmo7HmBf1yxtQ55W0DVKPE07PTw86JjOrmeawFOBAiB9
DJPdlG5QQzgJkaj/LtI377B/tWYOuCEzTRtzak7kiQ==
-----END RSA PRIVATE KEY-----`;

function env(): Env {
  return {
    GITHUB_PLATFORM_APP_ID: "999",
    GITHUB_PLATFORM_APP_PRIVATE_KEY: PKCS1_PEM,
    PLATFORM_ORG: "wikigit-tenants",
    REPO_NAME: "wiki-n-go",
    CONTENT_DIR: "content",
    BRANCH: "main",
  } as unknown as Env;
}

// resetModules per test → fresh module-level token cache, no production reset hook.
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("platformEnabled", () => {
  it("needs all three: app id, key, and org", async () => {
    const { platformEnabled } = await import("./provision");
    expect(platformEnabled(env())).toBe(true);
    expect(platformEnabled({ ...env(), PLATFORM_ORG: undefined } as Env)).toBe(false);
    expect(platformEnabled({} as Env)).toBe(false);
  });
});

function stub(repoStatus: number) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method, body: init?.body as string });
    if (url.endsWith("/orgs/wikigit-tenants/installation"))
      return Response.json({ id: 1 });
    if (url.includes("/access_tokens"))
      return Response.json({ token: "tok", expires_at: "2999-01-01T00:00:00Z" });
    if (url.endsWith("/orgs/wikigit-tenants/repos"))
      return new Response("{}", { status: repoStatus });
    if (url.includes("/contents/")) return new Response("{}", { status: 201 });
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}

describe("provisionRepo", () => {
  it("creates the org repo and seeds home + config", async () => {
    const calls = stub(201);
    const { provisionRepo } = await import("./provision");
    const repo = await provisionRepo(env(), "recipes");
    expect(repo).toBe("wikigit-tenants/recipes");

    const create = calls.find((c) => c.url.endsWith("/orgs/wikigit-tenants/repos"));
    expect(JSON.parse(create?.body ?? "{}")).toMatchObject({
      name: "recipes",
      auto_init: true,
    });
    const seeded = calls.filter((c) => c.url.includes("/contents/")).map((c) => c.url);
    expect(seeded.some((u) => u.includes("/content/index.md"))).toBe(true);
    expect(seeded.some((u) => u.includes("/wikigit.json"))).toBe(true);
  });

  it("maps a name collision (422) to a 409", async () => {
    stub(422);
    const { provisionRepo } = await import("./provision");
    await expect(provisionRepo(env(), "taken")).rejects.toMatchObject({ status: 409 });
  });

  it("throws 503 when managed hosting isn't configured", async () => {
    const { provisionRepo } = await import("./provision");
    await expect(provisionRepo({} as Env, "x")).rejects.toMatchObject({ status: 503 });
  });
});
