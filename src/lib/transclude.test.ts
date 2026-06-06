import { describe, expect, it } from "vitest";
import { md } from "./markdown";

describe("transclusion block rule", () => {
  it("turns a standalone {{slug}} into a placeholder div", () => {
    const html = md.render("{{getting-started}}");
    expect(html).toContain('class="transclude" data-src="getting-started"');
    // no-JS fallback link to the source page
    expect(html).toContain('href="/getting-started"');
  });

  it("slugifies the target and keeps nested paths", () => {
    expect(md.render("{{Getting Started}}")).toContain('data-src="getting-started"');
    expect(md.render("{{templates/coffee-nav}}")).toContain(
      'data-src="templates/coffee-nav"',
    );
  });

  it("only matches a whole line, never mid-sentence", () => {
    const html = md.render("See {{getting-started}} below.");
    expect(html).not.toContain("transclude");
    expect(html).toContain("{{getting-started}}");
  });

  it("yields to the citation template ({{cite|…}} is not a transclusion)", () => {
    const html = md.render("{{cite|url=https://x.dev|title=Hi}}");
    expect(html).not.toContain("transclude");
    expect(html).toContain('class="cite-ref"');
  });

  it("leaves a piped non-cite brace as literal text", () => {
    const html = md.render("{{nav|extra}}");
    expect(html).not.toContain("transclude");
    expect(html).toContain("{{nav|extra}}");
  });
});
