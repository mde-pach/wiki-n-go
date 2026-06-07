import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./auth";
import { writerFor } from "./index";

describe("writerFor", () => {
  it("maps an anonymous request to anon-<hash>", () => {
    const w = writerFor(null, "3f9a2c");
    expect(w).toMatchObject({ name: "anon-3f9a2c", key: "anon-3f9a2c", isAnon: true });
    expect(w.email).toBe("anon-3f9a2c@anon.invalid");
  });

  it("maps a GitHub session to its login + no-reply email", () => {
    const w = writerFor(
      { provider: "github", login: "octocat", id: 583231, avatar: "a", exp: 0 },
      "x",
    );
    expect(w).toMatchObject({ name: "octocat", key: "gh:octocat", isAnon: false });
    expect(w.email).toBe("583231+octocat@users.noreply.github.com");
  });

  it("maps a Wikigit session to a wg: key off the stable sub (handle is display only)", () => {
    const w = writerFor(
      { provider: "wikigit", login: "alice", id: 0, avatar: "p", sub: "u_123", exp: 0 },
      "x",
    );
    expect(w).toMatchObject({
      name: "alice", // display handle
      key: "wg:u_123", // keyed off the stable id, not the handle
      isAnon: false,
      avatar: "p",
    });
    expect(w.email).toBe("wg-u_123@users.wikigit.invalid");
  });

  it("treats a legacy session without a provider as GitHub", () => {
    const w = writerFor({ login: "octocat", id: 1, avatar: "", exp: 0 }, "x");
    expect(w.key).toBe("gh:octocat");
  });
});

describe("session provider roundtrip", () => {
  it("signs and verifies a Wikigit session carrying its provider", async () => {
    const jwt = await signSession(
      "secret",
      { login: "alice", id: 0, avatar: "p", provider: "wikigit" },
      1000,
    );
    const s = await verifySession("secret", jwt, 2000);
    expect(s?.provider).toBe("wikigit");
    expect(s?.login).toBe("alice");
  });
});
