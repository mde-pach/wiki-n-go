import { describe, expect, it } from "vitest";
import { globMatch, ipHash, SLUG_RE } from "./index";

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

describe("globMatch (protection paths)", () => {
  it("matches exact slugs", () => {
    expect(globMatch("index", "index")).toBe(true);
    expect(globMatch("index", "index2")).toBe(false);
  });
  it("`*` stays within one segment", () => {
    expect(globMatch("sandbox/*", "sandbox/foo")).toBe(true);
    expect(globMatch("sandbox/*", "sandbox/foo/bar")).toBe(false);
  });
  it("`**` spans segments", () => {
    expect(globMatch("sandbox/**", "sandbox/foo")).toBe(true);
    expect(globMatch("sandbox/**", "sandbox/foo/bar")).toBe(true);
    expect(globMatch("**", "anything/at/all")).toBe(true);
  });
  it("does not leak across a prefix boundary", () => {
    expect(globMatch("docs/**", "docsx/foo")).toBe(false);
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
