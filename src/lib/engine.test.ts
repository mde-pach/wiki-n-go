import { describe, expect, it } from "vitest";
import { repoSlug, withRepoParam } from "./engine";

describe("withRepoParam", () => {
  it("adds ?repo when the path has no query", () => {
    expect(withRepoParam("/pages", "o/r")).toBe("/pages?repo=o%2Fr");
  });

  it("adds &repo when the path already has a query", () => {
    expect(withRepoParam("/history?slug=coffee", "o/r")).toBe(
      "/history?slug=coffee&repo=o%2Fr",
    );
  });

  it("url-encodes the slug (slash escaped)", () => {
    expect(withRepoParam("/x", "owner-1/repo.name")).toBe(
      "/x?repo=owner-1%2Frepo.name",
    );
  });
});

describe("repoSlug", () => {
  it("joins an explicit repo as owner/name", () => {
    expect(repoSlug({ owner: "a", name: "b" })).toBe("a/b");
  });
});
