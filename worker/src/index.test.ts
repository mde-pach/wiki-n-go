import { describe, expect, it } from "vitest";
import { frontmatter, ipHash, lastPage, pageTier, SLUG_RE } from "./index";

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

describe("ipHash", () => {
  it("is deterministic for the same secret + ip", async () => {
    const a = await ipHash("secret", "203.0.113.7");
    const b = await ipHash("secret", "203.0.113.7");
    expect(a).toBe(b);
  });
  it("returns 8 hex chars and changes with the secret", async () => {
    const a = await ipHash("secret-1", "203.0.113.7");
    const b = await ipHash("secret-2", "203.0.113.7");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});
