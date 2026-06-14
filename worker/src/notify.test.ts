import { afterEach, describe, expect, it, vi } from "vitest";
import {
  keyFromCommitEmail,
  mentionFor,
  notifyByEmail,
  notifyPendingReview,
  notifyRevert,
} from "./notify";
import type { Env } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("keyFromCommitEmail", () => {
  it("recovers a wg identity", () => {
    expect(keyFromCommitEmail("wg-abc123@users.wikigit.invalid")).toBe("wg:abc123");
  });
  it("recovers a gh identity from the noreply email", () => {
    expect(keyFromCommitEmail("4567+octocat@users.noreply.github.com")).toBe(
      "gh:octocat",
    );
  });
  it("returns null for anon / bot / unknown", () => {
    expect(keyFromCommitEmail("anon-deadbeef@anon.invalid")).toBeNull();
    expect(keyFromCommitEmail("bot@anon.invalid")).toBeNull();
    expect(keyFromCommitEmail("someone@example.com")).toBeNull();
  });
});

describe("mentionFor", () => {
  it("returns the login for a gh key, null otherwise", () => {
    expect(mentionFor("gh:octocat")).toBe("octocat");
    expect(mentionFor("wg:42")).toBeNull();
    expect(mentionFor("anon-x")).toBeNull();
  });
});

describe("notifyByEmail", () => {
  const note = { subject: "s", body: "b", link: "https://l" };

  it("no-ops when mail isn't configured", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (...a: unknown[]) => {
      calls.push(a);
      return new Response("{}");
    });
    await notifyByEmail({} as Env, "wg:42", note);
    expect(calls).toHaveLength(0);
  });

  it("skips gh and anon identities (reached elsewhere)", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (...a: unknown[]) => {
      calls.push(a);
      return new Response("{}");
    });
    const env = { IDP_MAIL_URL: "https://idp/notify" } as Env;
    await notifyByEmail(env, "gh:octocat", note);
    await notifyByEmail(env, "anon-x", note);
    expect(calls).toHaveLength(0);
  });

  it("POSTs the sub + note (with bearer) for a wg identity", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response("{}");
    });
    const env = {
      IDP_MAIL_URL: "https://idp/notify",
      IDP_MAIL_TOKEN: "secret",
    } as Env;
    await notifyByEmail(env, "wg:42", note);
    expect(captured?.url).toBe("https://idp/notify");
    expect((captured?.init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret",
    );
    expect(JSON.parse(String(captured?.init.body))).toEqual({ sub: "42", ...note });
  });

  it("swallows a mail error (best-effort, never blocks the action)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("smtp down");
    });
    await expect(
      notifyByEmail({ IDP_MAIL_URL: "https://idp/notify" } as Env, "wg:42", note),
    ).resolves.toBeUndefined();
  });
});

describe("notifyRevert", () => {
  const env = () =>
    ({
      REPO_OWNER: "acme",
      REPO_NAME: "wiki",
      GITHUB_TOKEN: "tok",
      IDP_MAIL_URL: "https://idp/notify",
    }) as Env;

  it("posts a commit comment that @-mentions a gh author", async () => {
    let captured: { url: string; body: string } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url, body: String(init.body) };
      return Response.json({});
    });
    await notifyRevert(env(), "gh:octocat", "deadbeef", ["coffee", "tea"]);
    expect(captured?.url).toBe(
      "https://api.github.com/repos/acme/wiki/commits/deadbeef/comments",
    );
    expect(JSON.parse(captured?.body ?? "{}").body).toContain("@octocat");
    expect(JSON.parse(captured?.body ?? "{}").body).toContain("coffee, tea");
  });

  it("emails a wg author via the IdP", async () => {
    let captured: { url: string; body: string } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url, body: String(init.body) };
      return Response.json({});
    });
    await notifyRevert(env(), "wg:42", "deadbeef", ["coffee"]);
    expect(captured?.url).toBe("https://idp/notify");
    expect(JSON.parse(captured?.body ?? "{}").sub).toBe("42");
  });

  it("does nothing for an unknown/anon author", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async (...a: unknown[]) => {
      calls.push(a);
      return Response.json({});
    });
    await notifyRevert(env(), null, "deadbeef", ["coffee"]);
    expect(calls).toHaveLength(0);
  });
});

describe("notifyPendingReview", () => {
  const env = () =>
    ({
      REPO_OWNER: "acme",
      REPO_NAME: "wiki",
      BRANCH: "main",
      GITHUB_TOKEN: "tok",
      IDP_MAIL_URL: "https://idp/notify",
    }) as Env;

  it("@-mentions gh maintainers in one PR comment and emails wg ones", async () => {
    const posts: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/trusted-editors.json")) return Response.json(["wg:42"]);
      if (url.endsWith("/wikigit.json"))
        return Response.json({ maintainers: ["alice"] });
      posts.push({ url, body: String(init.body) });
      return Response.json({});
    });
    await notifyPendingReview(env(), 7, "coffee", "https://pr/7");

    const comment = posts.find((p) => p.url.endsWith("/issues/7/comments"));
    expect(comment).toBeTruthy();
    // owner + config maintainer get @-mentioned; the wg maintainer does not.
    expect(JSON.parse(comment?.body ?? "{}").body).toContain("@acme");
    expect(JSON.parse(comment?.body ?? "{}").body).toContain("@alice");
    expect(JSON.parse(comment?.body ?? "{}").body).not.toContain("@42");

    const email = posts.find((p) => p.url === "https://idp/notify");
    expect(JSON.parse(email?.body ?? "{}").sub).toBe("42");
  });
});
