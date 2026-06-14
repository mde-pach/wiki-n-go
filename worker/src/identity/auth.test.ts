import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../http";
import type { Env } from "../types";
import { authCallback, authLogin, signSession, verifySession } from "./auth";

const SECRET = "test-session-secret";

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    SESSION_SECRET: SECRET,
    ALLOWED_ORIGIN: "https://wiki.example",
    OAUTH_CLIENT_ID: "cid",
    OAUTH_CLIENT_SECRET: "csecret",
    REPO_NAME: "r",
    ...over,
  } as unknown as Env;
}

afterEach(() => vi.unstubAllGlobals());

const statusOf = async (p: Promise<unknown>): Promise<number | "ok"> => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
};

describe("signSession / verifySession", () => {
  it("round-trips a valid session", async () => {
    const jwt = await signSession(SECRET, {
      login: "alice",
      id: 7,
      avatar: "a.png",
      provider: "github",
    });
    const s = await verifySession(SECRET, jwt);
    expect(s?.login).toBe("alice");
    expect(s?.id).toBe(7);
    expect(s?.provider).toBe("github");
  });

  it("rejects a wrong-secret signature", async () => {
    const jwt = await signSession(SECRET, { login: "a", id: 1, avatar: "" });
    expect(await verifySession("other-secret", jwt)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const jwt = await signSession(SECRET, { login: "a", id: 1, avatar: "" });
    const [h, , sig] = jwt.split(".");
    const forged = btoa(JSON.stringify({ login: "admin", id: 1, exp: 9e9 }))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(await verifySession(SECRET, `${h}.${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const past = Date.now() - 8 * 86_400_000;
    const jwt = await signSession(SECRET, { login: "a", id: 1, avatar: "" }, past);
    expect(await verifySession(SECRET, jwt)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifySession(SECRET, "not-a-jwt")).toBeNull();
    expect(await verifySession(SECRET, "a.b")).toBeNull();
  });
});

describe("authLogin (CSRF state + open-redirect guard)", () => {
  it("redirects to the provider authorize URL carrying signed state", async () => {
    const url = new URL(
      "https://api.example/auth/login?provider=github&return=https://wiki.example/page",
    );
    const res = await authLogin(makeEnv(), url);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("state")).toBeTruthy();
    expect(loc.searchParams.get("redirect_uri")).toBe(
      "https://api.example/auth/callback",
    );
  });

  it("400s on a return URL off the allowlist", async () => {
    const url = new URL("https://api.example/auth/login?return=https://evil.example/x");
    expect(await statusOf(authLogin(makeEnv(), url))).toBe(400);
  });

  it("fails closed when ALLOWED_ORIGIN is unset (SEC-9)", async () => {
    const url = new URL(
      "https://api.example/auth/login?return=https://anywhere.example/x",
    );
    expect(await statusOf(authLogin(makeEnv({ ALLOWED_ORIGIN: "" }), url))).toBe(400);
  });

  it("503s when sign-in is not configured", async () => {
    const url = new URL("https://api.example/auth/login?return=https://wiki.example/");
    const env = makeEnv({ OAUTH_CLIENT_ID: "", OAUTH_CLIENT_SECRET: "" });
    expect(await statusOf(authLogin(env, url))).toBe(503);
  });
});

describe("authCallback (round-trip)", () => {
  // Reuse authLogin to mint a valid state, so the callback exercises the real
  // signState→verifyState pair rather than a hand-forged token.
  async function validState(env: Env): Promise<string> {
    const res = await authLogin(
      env,
      new URL("https://api.example/auth/login?return=https://wiki.example/p"),
    );
    return new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "";
  }

  it("exchanges the code and redirects to the return URL with the session token", async () => {
    const env = makeEnv();
    const state = await validState(env);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const u = String(input);
      if (u.includes("login/oauth/access_token"))
        return Response.json({ access_token: "gho_x" });
      if (u.includes("api.github.com/user"))
        return Response.json({ login: "alice", id: 7, avatar_url: "a.png" });
      throw new Error(`unexpected fetch: ${u}`);
    });

    const res = await authCallback(
      env,
      new URL(
        `https://api.example/auth/callback?code=abc&state=${encodeURIComponent(state)}`,
      ),
    );
    expect(res.status).toBe(302);
    const dest = new URL(res.headers.get("location") ?? "");
    expect(dest.origin).toBe("https://wiki.example");
    const token = dest.hash.match(/wikitoken=(.+)$/)?.[1];
    expect(token).toBeTruthy();
    const s = await verifySession(SECRET, token ?? "");
    expect(s?.login).toBe("alice");
  });

  it("400s on a forged/invalid state", async () => {
    const res = authCallback(
      makeEnv(),
      new URL("https://api.example/auth/callback?code=abc&state=forged"),
    );
    expect(await statusOf(res)).toBe(400);
  });

  it("400s when the authorization code is missing", async () => {
    const env = makeEnv();
    const state = await validState(env);
    const res = authCallback(
      env,
      new URL(`https://api.example/auth/callback?state=${encodeURIComponent(state)}`),
    );
    expect(await statusOf(res)).toBe(400);
  });
});
