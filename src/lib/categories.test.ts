import { describe, expect, it } from "vitest";
import {
  allCategories,
  catKeyOf,
  classifyTags,
  groupCategory,
  intersectMembers,
  isMaintenanceCategory,
  parseCategoryQuery,
} from "./categories";

describe("catKeyOf", () => {
  it("slugifies the last path segment", () => {
    expect(catKeyOf("film")).toBe("film");
    expect(catKeyOf("arts/Science Fiction")).toBe("science-fiction");
  });
});

describe("isMaintenanceCategory", () => {
  it("flags the built-in cleanup tags and namespace prefixes", () => {
    expect(isMaintenanceCategory("stub")).toBe(true);
    expect(isMaintenanceCategory("needs-citation")).toBe(true);
    expect(isMaintenanceCategory("maintenance-broken-links")).toBe(true);
    expect(isMaintenanceCategory("cleanup-2026")).toBe(true);
  });
  it("leaves topical tags alone", () => {
    expect(isMaintenanceCategory("film")).toBe(false);
    expect(isMaintenanceCategory("coffee")).toBe(false);
  });
});

describe("classifyTags", () => {
  it("splits topical from maintenance, keeps display text, dedupes by slug", () => {
    expect(classifyTags(["Film", "Stub", "film", "Needs citation"])).toEqual({
      topical: ["Film"],
      maintenance: ["Stub", "Needs citation"],
    });
  });
  it("drops empties", () => {
    expect(classifyTags(["", "  ", "Film"])).toEqual({
      topical: ["Film"],
      maintenance: [],
    });
  });
});

describe("parseCategoryQuery", () => {
  it("splits an intersection on + and slugifies each tag", () => {
    expect(parseCategoryQuery("Film+French Cinema")).toEqual(["film", "french-cinema"]);
  });
  it("dedupes and drops empties", () => {
    expect(parseCategoryQuery("film+film+")).toEqual(["film"]);
  });
});

describe("intersectMembers", () => {
  const categories = {
    a: ["p1", "p2", "p3"],
    b: ["p2", "p3", "p4"],
    c: ["p3"],
  };
  it("returns the single list for one tag", () => {
    expect(intersectMembers(categories, ["a"])).toEqual(["p1", "p2", "p3"]);
  });
  it("intersects across multiple tags", () => {
    expect(intersectMembers(categories, ["a", "b"])).toEqual(["p2", "p3"]);
    expect(intersectMembers(categories, ["a", "b", "c"])).toEqual(["p3"]);
  });
  it("is empty when any tag is unknown", () => {
    expect(intersectMembers(categories, ["a", "missing"])).toEqual([]);
    expect(intersectMembers(categories, [])).toEqual([]);
  });
});

describe("groupCategory", () => {
  // `film` is a member of `arts` and is itself a category (has its own members),
  // so under `arts` it surfaces as a subcategory. `arts` is the parent of `film`.
  const g = {
    titles: {
      arts: "Arts",
      film: "Film",
      espresso: "Espresso",
      "a-movie": "A Movie",
      "z-movie": "Z Movie",
    },
    categories: {
      arts: ["film", "espresso"],
      film: ["z-movie", "a-movie"],
      coffee: ["espresso"],
    },
  };

  it("splits subcategories from pages and sorts by title", () => {
    const r = groupCategory(g, ["arts"]);
    expect(r.subcategories).toEqual([
      { slug: "film", title: "Film", cat: "film", count: 2 },
    ]);
    expect(r.pages).toEqual([{ slug: "espresso", title: "Espresso" }]);
    expect(r.intersection).toBe(false);
    expect(r.total).toBe(2);
  });

  it("orders members by title, not slug", () => {
    const r = groupCategory(g, ["film"]);
    expect(r.pages.map((p) => p.slug)).toEqual(["a-movie", "z-movie"]);
  });

  it("finds the category's parent categories from its backing page", () => {
    expect(groupCategory(g, ["film"]).parents).toEqual(["arts"]);
    expect(groupCategory(g, ["arts"]).parents).toEqual([]);
  });

  it("computes an intersection across tags (no parents)", () => {
    const r = groupCategory(g, ["arts", "coffee"]);
    expect(r.intersection).toBe(true);
    expect(r.pages.map((p) => p.slug)).toEqual(["espresso"]);
    expect(r.parents).toEqual([]);
  });

  it("flags a maintenance category", () => {
    expect(groupCategory(g, ["stub"]).maintenance).toBe(true);
    expect(groupCategory(g, ["arts"]).maintenance).toBe(false);
  });
});

describe("allCategories", () => {
  it("lists every category with a count, split topical vs maintenance", () => {
    const r = allCategories({ film: ["a", "b"], stub: ["a"], coffee: ["c"] });
    expect(r.topical).toEqual([
      { slug: "coffee", count: 1 },
      { slug: "film", count: 2 },
    ]);
    expect(r.maintenance).toEqual([{ slug: "stub", count: 1 }]);
  });
});
