import { describe, expect, it } from "vitest";
import { parseConfigFile, sanitizeConfig } from "./siteconfig";

describe("sanitizeConfig", () => {
  it("keeps valid known fields", () => {
    const c = sanitizeConfig({
      title: "My Wiki",
      tagline: "the best wiki",
      description: "A wiki about things.",
      homeSlug: "home",
      defaultLang: "fr",
      languages: [
        { code: "en", name: "English" },
        { code: "fr", name: "Français" },
      ],
      appearance: { theme: "dark", width: "wide" },
      signin: true,
    });
    expect(c.title).toBe("My Wiki");
    expect(c.defaultLang).toBe("fr");
    expect(c.languages).toHaveLength(2);
    expect(c.appearance).toEqual({ theme: "dark", width: "wide" });
    expect(c.signin).toBe(true);
  });

  it("drops unknown keys and malformed values", () => {
    const c = sanitizeConfig({
      title: 42, // wrong type → dropped
      evil: "<script>", // unknown key → dropped
      homeSlug: "Bad Slug!", // invalid → dropped
      defaultLang: "english", // not a code → dropped
      appearance: { theme: "neon", skin: "wiki" }, // theme invalid, skin valid
      languages: [{ code: "en" }, { code: "x", name: "Bad" }], // missing name / bad code
    });
    expect(c.title).toBeUndefined();
    expect((c as Record<string, unknown>).evil).toBeUndefined();
    expect(c.homeSlug).toBeUndefined();
    expect(c.defaultLang).toBeUndefined();
    expect(c.appearance).toEqual({ skin: "wiki" });
    expect(c.languages).toBeUndefined(); // both entries invalid
  });

  it("trims strings and enforces length caps", () => {
    expect(sanitizeConfig({ title: "  spaced  " }).title).toBe("spaced");
    expect(sanitizeConfig({ title: "x".repeat(81) }).title).toBeUndefined();
  });

  it("keeps valid maintainer logins and provider-qualified keys", () => {
    expect(
      sanitizeConfig({ maintainers: ["alice", "gh:bob", "wg:42", "anon-1a2b"] })
        .maintainers,
    ).toEqual(["alice", "gh:bob", "wg:42", "anon-1a2b"]);
  });

  it("drops malformed maintainer entries, dedupes, and caps the list", () => {
    expect(
      sanitizeConfig({ maintainers: ["ok", "ok", "has space", "", 7, "x@y"] })
        .maintainers,
    ).toEqual(["ok"]);
    const many = Array.from({ length: 150 }, (_, i) => `u${i}`);
    expect(sanitizeConfig({ maintainers: many }).maintainers).toHaveLength(100);
    expect(sanitizeConfig({ maintainers: [] }).maintainers).toBeUndefined();
  });
});

describe("parseConfigFile", () => {
  it("returns {} for empty / invalid JSON", () => {
    expect(parseConfigFile(undefined)).toEqual({});
    expect(parseConfigFile("")).toEqual({});
    expect(parseConfigFile("not json")).toEqual({});
  });

  it("parses and sanitizes a committed file", () => {
    expect(parseConfigFile('{"title":"T","junk":1}')).toEqual({ title: "T" });
  });
});
