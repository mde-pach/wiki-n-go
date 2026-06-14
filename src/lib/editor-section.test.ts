import { describe, expect, it } from "vitest";
import { findSection, spliceSection } from "./editor-section";

const DOC = `Intro paragraph.

## First Section
First body.

## Second Section
Second body.

### Nested
Nested body.
`;

describe("findSection", () => {
  it("spans from the matched heading to the next same-or-higher-level heading", () => {
    const span = findSection(DOC, "first-section");
    expect(span).toBeDefined();
    expect(DOC.slice(span?.start, span?.end)).toBe("## First Section\nFirst body.\n\n");
    expect(span?.heading).toBe("First Section");
  });

  it("includes deeper subsections under the matched heading", () => {
    const span = findSection(DOC, "second-section");
    expect(DOC.slice(span?.start, span?.end)).toBe(
      "## Second Section\nSecond body.\n\n### Nested\nNested body.\n",
    );
  });

  it("spans to end of text for the last section", () => {
    const span = findSection(DOC, "nested");
    expect(DOC.slice(span?.start, span?.end)).toBe("### Nested\nNested body.\n");
  });

  it("returns undefined when the section is absent", () => {
    expect(findSection(DOC, "missing")).toBeUndefined();
  });
});

const DUP = `## Notes
First notes body.

## Other
Middle.

## Notes
Second notes body.
`;

describe("findSection with duplicate headings (FE-5)", () => {
  it("resolves the first occurrence by its base id", () => {
    const span = findSection(DUP, "notes");
    expect(DUP.slice(span?.start, span?.end)).toBe("## Notes\nFirst notes body.\n\n");
  });

  it("resolves the second occurrence by its -1 suffix, not the first", () => {
    const span = findSection(DUP, "notes-1");
    expect(span).toBeDefined();
    expect(DUP.slice(span?.start, span?.end)).toBe("## Notes\nSecond notes body.\n");
  });

  it("a section edit splices the correct duplicate", () => {
    const span = findSection(DUP, "notes-1");
    if (!span) throw new Error("span not found");
    const out = spliceSection(DUP, span, "## Notes\nEDITED.\n");
    expect(out).toContain("First notes body."); // first untouched
    expect(out).toContain("EDITED.");
    expect(out).not.toContain("Second notes body."); // second replaced
  });
});

describe("spliceSection round-trip", () => {
  it("an unchanged splice reproduces the document exactly", () => {
    const span = findSection(DOC, "first-section");
    if (!span) throw new Error("expected a span");
    expect(spliceSection(DOC, span, DOC.slice(span.start, span.end))).toBe(DOC);
  });

  it("splices an edited last section back into the document", () => {
    const span = findSection(DOC, "nested");
    if (!span) throw new Error("expected a span");
    const edited = "### Nested\nRewritten nested body.\n";
    const next = spliceSection(DOC, span, edited);
    expect(next).toBe(
      `Intro paragraph.

## First Section
First body.

## Second Section
Second body.

### Nested
Rewritten nested body.
`,
    );
    // Re-locating the section yields exactly the edited slice (true round-trip).
    const again = findSection(next, "nested");
    expect(next.slice(again?.start, again?.end)).toBe(edited);
  });

  it("splices a section that contains a nested subsection", () => {
    const span = findSection(DOC, "second-section");
    if (!span) throw new Error("expected a span");
    const edited = DOC.slice(span.start, span.end).replace(
      "Second body.",
      "Edited second body.",
    );
    const next = spliceSection(DOC, span, edited);
    expect(next).toContain("## Second Section\nEdited second body.\n\n### Nested");
    expect(next.startsWith("Intro paragraph.\n")).toBe(true);
    expect(next.endsWith("Nested body.\n")).toBe(true);
    // Untouched siblings are preserved byte-for-byte.
    expect(next).toContain("## First Section\nFirst body.\n");
  });
});
