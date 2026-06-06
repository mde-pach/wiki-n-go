import { describe, expect, it } from "vitest";
import { md } from "./markdown";

describe("named-reference reuse", () => {
  const src = `See[^a] and again[^a] and once more[^a].

[^a]: Shared note.`;

  it("renders a single reference-list entry for a reused note", () => {
    const html = md.render(src);
    expect((html.match(/class="ref-target"/g) ?? []).length).toBe(1);
    expect(html).toContain("Shared note.");
  });

  it("emits one backlink per citation, lettered a/b/c", () => {
    const html = md.render(src);
    expect((html.match(/class="ref-backlink"/g) ?? []).length).toBe(3);
    expect(html).toContain("<sup>a</sup>");
    expect(html).toContain("<sup>b</sup>");
    expect(html).toContain("<sup>c</sup>");
  });

  it("leaves a single-use footnote with a plain ↑ backlink", () => {
    const html = md.render("Once[^x].\n\n[^x]: Lonely note.");
    expect(html).toContain("↑");
    expect(html).not.toContain("<sup>");
  });
});
