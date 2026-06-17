import { describe, expect, it } from "vitest";
import {
  authorOf,
  frontmatter,
  ipHash,
  lastPage,
  pageTier,
  pickCategory,
  SLUG_RE,
  signSession,
  verifySession,
} from "./index";

type Env = Parameters<typeof pageTier>[0];
const env = (DEFAULT_EDIT_TIER?: string) => ({ DEFAULT_EDIT_TIER }) as Env;

describe("SLUG_RE", () => {
  it("accepts lowercase, hyphen, and nested slugs", () => {
    for (const ok of ["index", "getting-started", "guides/quick-start", "a/b/c"]) {
      expect(SLUG_RE.test(ok)).toBe(true);
    }
  });
  it("rejects traversal, leading/trailing/double slashes, and bad chars", () => {
    for (const bad of [
      "../etc",
      "/leading",
      "trailing/",
      "double//slash",
      "Upper",
      "has space",
      "dot.dot",
      "-edge",
    ]) {
      expect(SLUG_RE.test(bad)).toBe(false);
    }
  });
});

describe("frontmatter", () => {
  it("parses the YAML block; empty when absent", () => {
    expect(frontmatter("---\nprotection: open\ntags: [a]\n---\n\n# Hi")).toEqual({
      protection: "open",
      tags: ["a"],
    });
    expect(frontmatter("# No frontmatter")).toEqual({});
  });
});

describe("lastPage (commit count from the Link header)", () => {
  it("reads the rel=last page number = total count at per_page=1", () => {
    const link =
      '<https://api.github.com/...&page=2>; rel="next", ' +
      '<https://api.github.com/...&page=42>; rel="last"';
    expect(lastPage(link)).toBe(42);
  });
  it("returns 1 when there is no last link (a single page)", () => {
    expect(lastPage("")).toBe(1);
    expect(lastPage('<https://api.github.com/...&page=2>; rel="next"')).toBe(1);
  });
});

describe("pageTier (protection field → required tier)", () => {
  it("reads the protection field", () => {
    expect(pageTier(env("maintainer"), { protection: "open" })).toBe("open");
    expect(pageTier(env("maintainer"), { protection: "extended" })).toBe("extended");
  });
  it("falls back to the env default when unset or invalid", () => {
    expect(pageTier(env("maintainer"), {})).toBe("maintainer");
    expect(pageTier(env("open"), {})).toBe("open");
    expect(pageTier(env("maintainer"), { protection: "bogus" })).toBe("maintainer");
  });
});

describe("signSession / verifySession", () => {
  const who = { login: "octocat", id: 583231, avatar: "https://avatars/u/1" };

  it("round-trips a signed session", async () => {
    const tok = await signSession("s3cret", who);
    const out = await verifySession("s3cret", tok);
    expect(out).toMatchObject(who);
    expect(typeof out?.exp).toBe("number");
  });

  it("rejects a wrong secret, a tampered payload, and an expired token", async () => {
    const tok = await signSession("s3cret", who);
    expect(await verifySession("other", tok)).toBeNull();

    const [h, , s] = tok.split(".");
    const forged = btoa(
      JSON.stringify({ ...who, login: "attacker", exp: 2_000_000_000 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession("s3cret", `${h}.${forged}.${s}`)).toBeNull();

    const past = Date.now() - 8 * 86_400_000;
    const old = await signSession("s3cret", who, past);
    expect(await verifySession("s3cret", old)).toBeNull();
  });
});

describe("authorOf (Discussion attribution markers)", () => {
  it("reads the anon marker → anonymous, no avatar", () => {
    expect(authorOf("<!-- anon:anon-3f9a2c -->\n\nhi", null)).toEqual({
      author: "anon-3f9a2c",
      isAnon: true,
      avatarUrl: null,
    });
  });
  it("reads the gh marker → login + avatar", () => {
    expect(authorOf("<!-- gh:octocat|https://avatars/u/1 -->\n\nhi", null)).toEqual({
      author: "octocat",
      isAnon: false,
      avatarUrl: "https://avatars/u/1",
    });
  });
  it("falls back to the GitHub author when no marker is present", () => {
    expect(authorOf("plain body", { login: "real", avatarUrl: "a" })).toEqual({
      author: "real",
      isAnon: false,
      avatarUrl: "a",
    });
  });
});

describe("pickCategory (discussion category by name)", () => {
  const cats = [
    { id: "DIC_a", name: "Announcements" },
    { id: "DIC_g", name: "General" },
    { id: "DIC_q", name: "Q&A" },
  ];
  it("matches by name, case-insensitively", () => {
    expect(pickCategory(cats, "General")).toBe("DIC_g");
    expect(pickCategory(cats, "q&a")).toBe("DIC_q");
  });
  it("falls back to the first category when the name is missing", () => {
    expect(pickCategory(cats, "Nope")).toBe("DIC_a");
  });
  it("returns null when there are no categories", () => {
    expect(pickCategory([], "General")).toBeNull();
  });
});

describe("ipHash", () => {
  it("is deterministic for the same secret + ip", async () => {
    const a = await ipHash("secret", "203.0.113.7");
    const b = await ipHash("secret", "203.0.113.7");
    expect(a).toBe(b);
  });
  it("returns 16 hex chars and changes with the secret", async () => {
    const a = await ipHash("secret-1", "203.0.113.7");
    const b = await ipHash("secret-2", "203.0.113.7");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });
});
