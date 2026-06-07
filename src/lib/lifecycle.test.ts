import { describe, expect, it } from "vitest";
import { listSections } from "./editor-section";
import { composeMerge, composeSplit } from "./lifecycle";

describe("composeMerge", () => {
  it("appends the source body under a heading and records merged_from", () => {
    const to = "---\nkicker: Article\n---\n\n# Target\n\nTarget body.";
    const from = "---\nkicker: Article\n---\n\n# Source\n\nSource body.";
    const out = composeMerge("source-page", from, to);
    expect(out).toContain("Target body.");
    expect(out).toContain("## Source page"); // prettified source slug as heading
    expect(out).toContain("Source body.");
    expect(out).toMatch(/merged_from:\n\s*- source-page/);
  });

  it("dedupes a repeated merge of the same source", () => {
    const to = "---\nmerged_from:\n  - source-page\n---\n\nBody.";
    const out = composeMerge("source-page", "Source body.", to);
    expect(out.match(/source-page/g)?.length).toBe(1);
  });

  it("keeps the target's other frontmatter", () => {
    const out = composeMerge("a", "Body A.", "---\ntags:\n  - X\n---\n\nBody B.");
    expect(out).toContain("tags:");
    expect(out).toContain("- X");
  });
});

describe("composeSplit", () => {
  const DOC =
    "---\ntags:\n  - X\n---\n\n# Big\n\nIntro.\n\n## Carve\n\nCarved body.\n\n## Keep\n\nKept body.";

  it("carves the section into a new page and trims the source", () => {
    const out = composeSplit("big", DOC, "carve");
    expect(out).not.toBeNull();
    if (!out) return;
    // New page: section heading promoted to top-level, provenance recorded.
    expect(out.toContent).toContain("# Carve");
    expect(out.toContent).toContain("Carved body.");
    expect(out.toContent).toContain("split_from: big");
    // Source: section gone, the rest (and its frontmatter) preserved.
    expect(out.fromContent).not.toContain("Carved body.");
    expect(out.fromContent).toContain("Intro.");
    expect(out.fromContent).toContain("Kept body.");
    expect(out.fromContent).toContain("tags:");
  });

  it("returns null for a missing section", () => {
    expect(composeSplit("big", DOC, "nope")).toBeNull();
  });
});

describe("listSections", () => {
  it("lists every ## / ### heading with its slug", () => {
    const secs = listSections("## One\n\nx\n\n### Two\n\ny");
    expect(secs.map((s) => s.slug)).toEqual(["one", "two"]);
  });
});
