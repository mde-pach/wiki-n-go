import { describe, expect, it } from "vitest";
import { defaultSiteConfig, mergeSiteConfig } from "./site-config";

describe("mergeSiteConfig", () => {
  it("returns baked defaults when the override is empty", () => {
    expect(mergeSiteConfig({})).toEqual(defaultSiteConfig());
  });

  it("overrides scalar fields and keeps the rest", () => {
    const merged = mergeSiteConfig({ title: "Acme", description: "A wiki." });
    expect(merged.title).toBe("Acme");
    expect(merged.description).toBe("A wiki.");
    expect(merged.tagline).toBe(defaultSiteConfig().tagline);
  });

  it("shallow-merges appearance over the defaults", () => {
    const merged = mergeSiteConfig({ appearance: { theme: "dark" } });
    expect(merged.appearance.theme).toBe("dark");
    expect(merged.appearance.skin).toBe(defaultSiteConfig().appearance.skin);
  });

  it("replaces the language list only when non-empty", () => {
    const langs = [{ code: "es", name: "Español" }];
    expect(mergeSiteConfig({ languages: langs }).languages).toEqual(langs);
    expect(mergeSiteConfig({ languages: [] }).languages).toEqual(
      defaultSiteConfig().languages,
    );
  });

  it("carries the maintainers list, defaulting to empty", () => {
    expect(mergeSiteConfig({}).maintainers).toEqual([]);
    expect(mergeSiteConfig({ maintainers: ["alice"] }).maintainers).toEqual(["alice"]);
  });
});
