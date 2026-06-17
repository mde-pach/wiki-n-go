import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { getProvider } from "./providers";

// The Wikigit provider lazy-imports the OpenAuth client + valibot for its token
// exchange and JWKS verify — a real round-trip needs a signed JWT and a JWKS
// endpoint, out of scope for a fetch stub. We mock the client so `exchange`/
// `verify` return controlled results and assert the identity mapping instead.
const exchange = vi.fn();
const verify = vi.fn();
vi.mock("@openauthjs/openauth/client", () => ({
  createClient: () => ({ exchange, verify }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  exchange.mockReset();
  verify.mockReset();
});

const githubEnv = {
  REPO_NAME: "r",
  OAUTH_CLIENT_ID: "cid",
  OAUTH_CLIENT_SECRET: "secret",
} as unknown as Env;

const wikigitEnv = { REPO_NAME: "r" } as unknown as Env;

const provider = (id: string) => {
  const p = getProvider(id);
  if (!p) throw new Error(`no provider ${id}`);
  return p;
};

describe("github exchange", () => {
  it("returns the verified identity on success", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/login/oauth/access_token"))
        return Response.json({ access_token: "gho_tok" });
      if (url.includes("api.github.com/user"))
        return Response.json({ login: "octocat", id: 42, avatar_url: "https://a/x" });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const id = await provider("github").exchange(githubEnv, "code", "https://w/cb");
    expect(id).toEqual({
      provider: "github",
      login: "octocat",
      id: 42,
      avatar: "https://a/x",
    });
  });

  it("502s when the token endpoint returns no access_token", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "bad_code" }));
    await expect(
      provider("github").exchange(githubEnv, "code", "https://w/cb"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("502s on a non-OK userinfo response", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/login/oauth/access_token"))
        return Response.json({ access_token: "gho_tok" });
      return new Response("nope", { status: 401 });
    });
    await expect(
      provider("github").exchange(githubEnv, "code", "https://w/cb"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("maps a malformed/empty userinfo body to undefined fields rather than throwing", async () => {
    // The code reads u.login/u.id/u.avatar_url without validating them, so an
    // empty 200 body yields an identity of undefineds (no throw).
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/login/oauth/access_token"))
        return Response.json({ access_token: "gho_tok" });
      return Response.json({});
    });
    const id = await provider("github").exchange(githubEnv, "code", "https://w/cb");
    expect(id).toEqual({
      provider: "github",
      login: undefined,
      id: undefined,
      avatar: undefined,
    });
  });
});

describe("wikigit exchange", () => {
  it("maps the verified subject to an identity on success", async () => {
    exchange.mockResolvedValue({ err: undefined, tokens: { access: "jwt" } });
    verify.mockResolvedValue({
      err: undefined,
      subject: { properties: { id: "sub-1", email: "a@b.test", handle: "ada" } },
    });

    const id = await provider("wikigit").exchange(wikigitEnv, "code", "https://w/cb");
    expect(id).toEqual({
      provider: "wikigit",
      login: "ada",
      id: 0,
      avatar: "",
      sub: "sub-1",
    });
  });

  it("502s when the token exchange errors", async () => {
    exchange.mockResolvedValue({ err: new Error("bad code") });
    await expect(
      provider("wikigit").exchange(wikigitEnv, "code", "https://w/cb"),
    ).rejects.toMatchObject({ status: 502 });
    expect(verify).not.toHaveBeenCalled();
  });

  it("502s when the token cannot be verified", async () => {
    exchange.mockResolvedValue({ err: undefined, tokens: { access: "jwt" } });
    verify.mockResolvedValue({ err: new Error("bad signature") });
    await expect(
      provider("wikigit").exchange(wikigitEnv, "code", "https://w/cb"),
    ).rejects.toMatchObject({ status: 502 });
  });
});
