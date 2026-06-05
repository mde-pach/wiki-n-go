import { describe, expect, it } from "vitest";
import { evaluateFilters, type FilterConfig } from "./filters";

const base: FilterConfig = {
  blankingRatio: 0.8,
  maxExternalLinksAdded: 3,
  blockedDomains: ["spam.example"],
  rules: [
    {
      id: "no-script",
      pattern: "<script",
      flags: "i",
      action: "disallow",
      message: "no script",
    },
    { id: "casino", pattern: "casino", flags: "i", action: "tag", tags: ["spam"] },
  ],
};

describe("evaluateFilters", () => {
  it("allows a normal edit", () => {
    const v = evaluateFilters(base, {
      oldRaw: "hello world",
      newContent: "hello there world",
    });
    expect(v).toEqual({ action: "allow", tags: [] });
  });

  it("disallows blanking most of the page", () => {
    const v = evaluateFilters(base, {
      oldRaw: "a".repeat(100),
      newContent: "a".repeat(5),
    });
    expect(v.action).toBe("disallow");
  });

  it("disallows adding too many external links", () => {
    const links = Array.from({ length: 5 }, (_, i) => `https://x${i}.com`).join(" ");
    const v = evaluateFilters(base, { oldRaw: "", newContent: links });
    expect(v.action).toBe("disallow");
  });

  it("disallows a newly-added blocked domain", () => {
    const v = evaluateFilters(base, {
      oldRaw: "clean",
      newContent: "clean http://spam.example/x",
    });
    expect(v.action).toBe("disallow");
  });

  it("disallows on a regex rule", () => {
    const v = evaluateFilters(base, {
      oldRaw: "",
      newContent: "<SCRIPT>alert(1)</script>",
    });
    expect(v).toMatchObject({ action: "disallow", message: "no script" });
  });

  it("tags (but allows) on a soft regex rule", () => {
    const v = evaluateFilters(base, { oldRaw: "", newContent: "play CASINO online" });
    expect(v).toEqual({ action: "allow", tags: ["spam"] });
  });

  it("ignores a malformed regex rule", () => {
    const v = evaluateFilters(
      { rules: [{ id: "bad", pattern: "(", action: "disallow" }] },
      { oldRaw: "", newContent: "anything" },
    );
    expect(v.action).toBe("allow");
  });
});
