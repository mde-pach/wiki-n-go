import { describe, expect, it } from "vitest";
import { formatCitation, parseCiteTemplate } from "./citetemplate";
import { md } from "./markdown";

describe("parseCiteTemplate", () => {
  it("parses the template name and pipe-delimited fields", () => {
    expect(parseCiteTemplate("cite|url=https://x.dev|title=Hello")).toEqual({
      url: "https://x.dev",
      title: "Hello",
    });
  });

  it("tolerates spacing and a qualified template name", () => {
    expect(parseCiteTemplate("cite web | title = Spaced | year = 2020 ")).toEqual({
      title: "Spaced",
      year: "2020",
    });
  });

  it("lowercases keys and keeps `=` inside values", () => {
    expect(parseCiteTemplate("cite|URL=https://x.dev/?a=b&c=d")).toEqual({
      url: "https://x.dev/?a=b&c=d",
    });
  });

  it("returns null when it is not a cite template", () => {
    expect(parseCiteTemplate("see|url=x")).toBeNull();
    expect(parseCiteTemplate("note")).toBeNull();
  });
});

describe("formatCitation", () => {
  it("links the title when a url is present", () => {
    expect(formatCitation({ url: "https://x.dev", title: "Hello" })).toBe(
      "[Hello](https://x.dev).",
    );
  });

  it("composes author, title, container and date", () => {
    expect(
      formatCitation({
        author: "Doe",
        first: "Jane",
        title: "A Study",
        journal: "Nature",
        year: "2021",
      }),
    ).toBe("Doe, Jane. “A Study”. *Nature*. (2021).");
  });

  it("falls back to a bare url when there is no title", () => {
    expect(formatCitation({ url: "https://x.dev" })).toBe("<https://x.dev>.");
  });
});

describe("cite template rendering", () => {
  it("renders a {{cite}} as a numbered footnote with a reference list", () => {
    const html = md.render("Text.{{cite|url=https://x.dev|title=Hi}}");
    expect(html).toContain('<a class="cite-ref"');
    expect(html).toContain('href="#ref-1"');
    expect(html).toContain('<a href="https://x.dev">Hi</a>');
  });

  it("does not fire inside code spans", () => {
    const html = md.render("Literal `{{cite|url=x}}` stays.");
    expect(html).toContain("{{cite|url=x}}");
    expect(html).not.toContain('class="cite-ref"');
  });

  it("reuses one reference for repeated ref= ids, with multiple backlinks", () => {
    const html = md.render(
      "First{{cite|ref=k|url=https://x.dev|title=Hi}} again{{cite|ref=k}}.",
    );
    expect((html.match(/class="ref-target"/g) ?? []).length).toBe(1);
    expect((html.match(/class="ref-backlink"/g) ?? []).length).toBe(2);
    expect(html).toContain("<sup>a</sup>");
    expect(html).toContain("<sup>b</sup>");
  });
});
