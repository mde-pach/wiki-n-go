import { describe, expect, it } from "vitest";
import { findSection } from "./editor-section";

const DOC = `Intro paragraph.

## First Section
First body.

## Second Section
Second body.

### Nested
Nested body.
`;

describe("findSection", () => {
  it("spans from the matched heading to the next heading", () => {
    const span = findSection(DOC, "first-section");
    expect(span).toBeDefined();
    const slice = DOC.slice(span?.start, span?.end);
    expect(slice).toBe("## First Section\nFirst body.\n\n");
    expect(span?.heading).toBe("First Section");
  });

  it("spans to the next heading of any level", () => {
    const span = findSection(DOC, "second-section");
    const slice = DOC.slice(span?.start, span?.end);
    expect(slice).toBe("## Second Section\nSecond body.\n\n");
  });

  it("spans to end of text for the last section", () => {
    const span = findSection(DOC, "nested");
    const slice = DOC.slice(span?.start, span?.end);
    expect(slice).toBe("### Nested\nNested body.\n");
  });

  it("returns undefined when the section is absent", () => {
    expect(findSection(DOC, "missing")).toBeUndefined();
  });
});
