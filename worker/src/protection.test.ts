import { describe, expect, it } from "vitest";
import { setProtectionField } from "./protection";

const body = "# Title\n\nBody text.\n";

describe("setProtectionField", () => {
  it("adds a frontmatter block when there is none", () => {
    expect(setProtectionField(body, "extended")).toBe(
      `---\nprotection: extended\n---\n\n${body}`,
    );
  });
  it("leaves a frontmatter-less page untouched when clearing", () => {
    expect(setProtectionField(body, null)).toBe(body);
  });
  it("appends to existing frontmatter that lacks the field", () => {
    const raw = `---\ntitle: Hi\n---\n\n${body}`;
    expect(setProtectionField(raw, "maintainer")).toBe(
      `---\ntitle: Hi\nprotection: maintainer\n---\n\n${body}`,
    );
  });
  it("replaces an existing protection value, keeping siblings + body", () => {
    const raw = `---\ntitle: Hi\nprotection: open\ntags: [a]\n---\n\n${body}`;
    expect(setProtectionField(raw, "extended")).toBe(
      `---\ntitle: Hi\nprotection: extended\ntags: [a]\n---\n\n${body}`,
    );
  });
  it("removes the field when cleared, leaving the rest intact", () => {
    const raw = `---\ntitle: Hi\nprotection: open\ntags: [a]\n---\n\n${body}`;
    expect(setProtectionField(raw, null)).toBe(
      `---\ntitle: Hi\ntags: [a]\n---\n\n${body}`,
    );
  });
});
