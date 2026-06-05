import { describe, expect, it } from "vitest";
import {
  buildNode,
  computeGraph,
  extractLinks,
  slugifyTarget,
  toPlainText,
} from "./indexlib";

describe("buildNode", () => {
  it("pulls title from the body H1, links, redirect and plain text", () => {
    const raw =
      "---\nredirect: ignored-here\n---\n\n# Espresso\n\nA **bold** [[Coffee]] and [[w:X]].";
    const node = buildNode("espresso", raw, "coffee");
    expect(node.title).toBe("Espresso");
    expect(node.out).toEqual(["coffee"]); // interwiki [[w:X]] excluded from links
    expect(node.redirect).toBe("coffee");
    // heading text is kept (searchable); interwiki stays as text in the body
    expect(node.text).toBe("Espresso A bold Coffee and w:X.");
  });
  it("falls back to a prettified slug when there's no H1", () => {
    expect(buildNode("sandbox/play-area", "no heading").title).toBe("Play area");
  });
});

describe("extractLinks / toPlainText / slugifyTarget", () => {
  it("extractLinks dedupes and skips interwiki", () => {
    expect(extractLinks("[[A]] [[a]] [[w:B]] [[wikipedia:C]]")).toEqual(["a"]);
  });
  it("toPlainText strips markdown", () => {
    expect(toPlainText("## H\n\n> q **b** `c`")).toBe("H q b"); // inline code stripped
  });
  it("slugifyTarget keeps nested slashes", () => {
    expect(slugifyTarget("Sandbox/Play Ground")).toBe("sandbox/play-ground");
  });
});

describe("computeGraph", () => {
  it("flags broken/double redirects and excludes redirects from orphans", () => {
    const g = computeGraph(
      [
        { slug: "home", title: "Home", out: ["real"] },
        { slug: "real", title: "Real", out: [] },
        { slug: "lonely", title: "Lonely", out: [] },
        { slug: "alias", title: "Alias", out: [], redirect: "real" },
        { slug: "hop", title: "Hop", out: [], redirect: "alias" },
        { slug: "gone", title: "Gone", out: [], redirect: "missing" },
      ],
      "home",
    );
    expect(g.backlinks.real).toEqual(["home"]);
    expect(g.orphans).toEqual(["lonely"]);
    expect(g.redirects).toEqual([
      { from: "alias", to: "real", broken: false, double: false },
      { from: "gone", to: "missing", broken: true, double: false },
      { from: "hop", to: "alias", broken: false, double: true },
    ]);
  });
});
