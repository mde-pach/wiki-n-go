import { describe, expect, it } from "vitest";
import { headingLevel } from "./decorate";

const tag = (tagName: string) => ({ tagName }) as HTMLElement;

describe("headingLevel", () => {
  it("returns the numeric level for h2–h6", () => {
    expect(headingLevel(tag("H2"))).toBe(2);
    expect(headingLevel(tag("H3"))).toBe(3);
    expect(headingLevel(tag("H6"))).toBe(6);
  });

  it("returns 0 for non-heading or out-of-range tags", () => {
    expect(headingLevel(tag("H1"))).toBe(0);
    expect(headingLevel(tag("DIV"))).toBe(0);
    expect(headingLevel(tag("P"))).toBe(0);
  });
});
