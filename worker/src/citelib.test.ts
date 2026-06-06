import { describe, expect, it } from "vitest";
import {
  classify,
  crossrefCitation,
  formatMarkdown,
  htmlMetaCitation,
  openLibraryCitation,
} from "./citelib";

describe("classify", () => {
  it("detects bare and URL-form DOIs", () => {
    expect(classify("10.1000/xyz123")).toEqual({
      kind: "doi",
      value: "10.1000/xyz123",
    });
    expect(classify("https://doi.org/10.1038/nphys1170")).toEqual({
      kind: "doi",
      value: "10.1038/nphys1170",
    });
  });

  it("detects ISBN-10 and ISBN-13 with separators", () => {
    expect(classify("978-0-13-468599-1")).toEqual({
      kind: "isbn",
      value: "9780134685991",
    });
    expect(classify("0-201-61586-X")).toEqual({ kind: "isbn", value: "020161586X" });
  });

  it("falls back to URL", () => {
    expect(classify("https://example.com/post")).toEqual({
      kind: "url",
      value: "https://example.com/post",
    });
  });

  it("rejects junk", () => {
    expect(classify("  ")).toBeNull();
    expect(classify("not a citation")).toBeNull();
  });
});

describe("parsers", () => {
  it("builds a citation from a Crossref message", () => {
    const c = crossrefCitation(
      {
        title: ["A Great Paper"],
        author: [{ given: "Jane", family: "Doe" }, { family: "Smith" }],
        "container-title": ["Journal of Things"],
        issued: { "date-parts": [[2021, 4]] },
        URL: "https://doi.org/10.1/x",
      },
      "10.1/x",
    );
    expect(c).toEqual({
      kind: "doi",
      title: "A Great Paper",
      authors: ["Jane Doe", "Smith"],
      container: "Journal of Things",
      year: "2021",
      url: "https://doi.org/10.1/x",
    });
  });

  it("builds a citation from an OpenLibrary book", () => {
    const c = openLibraryCitation(
      {
        title: "Refactoring",
        authors: [{ name: "Martin Fowler" }],
        publishers: [{ name: "Addison-Wesley" }],
        publish_date: "July 1999",
      },
      "9780201485677",
    );
    expect(c.title).toBe("Refactoring");
    expect(c.authors).toEqual(["Martin Fowler"]);
    expect(c.container).toBe("Addison-Wesley");
    expect(c.year).toBe("1999");
  });

  it("extracts OpenGraph metadata from HTML, decoding entities", () => {
    const html = `<html><head>
      <meta property="og:title" content="Tom &amp; Jerry">
      <meta property="og:site_name" content="Cartoon Wiki">
      <meta name="author" content="A. Writer">
      <meta property="article:published_time" content="2020-02-02T00:00:00Z">
      <title>ignored</title></head></html>`;
    const c = htmlMetaCitation(html, "https://x.test/a");
    expect(c.title).toBe("Tom & Jerry");
    expect(c.container).toBe("Cartoon Wiki");
    expect(c.authors).toEqual(["A. Writer"]);
    expect(c.year).toBe("2020");
  });

  it("falls back to <title> and hostname when no meta tags", () => {
    const c = htmlMetaCitation(
      "<title>Just a Page</title>",
      "https://www.example.com/p",
    );
    expect(c.title).toBe("Just a Page");
    expect(c.container).toBe("example.com");
  });
});

describe("formatMarkdown", () => {
  it("renders a footnote-ready citation", () => {
    expect(
      formatMarkdown({
        kind: "doi",
        title: "A Great Paper",
        authors: ["Jane Doe", "Smith"],
        container: "Journal of Things",
        year: "2021",
        url: "https://doi.org/10.1/x",
      }),
    ).toBe(
      'Jane Doe, Smith. "A Great Paper." *Journal of Things*, 2021. <https://doi.org/10.1/x>',
    );
  });

  it("omits absent fields", () => {
    expect(
      formatMarkdown({
        kind: "url",
        title: "Bare",
        authors: [],
        container: "",
        year: "",
        url: "https://x.test",
      }),
    ).toBe('"Bare." <https://x.test>');
  });
});
