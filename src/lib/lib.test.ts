import { describe, expect, it } from "vitest";
import { parseDiff } from "./diff";
import { md, parsePage, splitTitle } from "./markdown";
import { prettify } from "./paths";
import { search, slugifyQuery, splitHighlight, toPlainText } from "./search";
import { markRedLinksHtml } from "./wikilink";

describe("prettify", () => {
  it("title-cases the last path segment", () => {
    expect(prettify("getting-started")).toBe("Getting started");
    expect(prettify("guides/quick-start")).toBe("Quick start");
    expect(prettify("index")).toBe("Index");
  });
});

describe("splitTitle", () => {
  it("splits a leading H1 from the body", () => {
    expect(splitTitle("# Hello\n\nbody")).toEqual({
      title: "Hello",
      body: "body",
      meta: {},
    });
  });
  it("returns an empty title when there is no H1", () => {
    expect(splitTitle("no heading here")).toEqual({
      title: "",
      body: "no heading here",
      meta: {},
    });
  });
  it("strips YAML frontmatter and exposes it as meta", () => {
    const { title, body, meta } = splitTitle(
      "---\ntags: [A, B]\n---\n\n# Title\n\nbody",
    );
    expect(title).toBe("Title");
    expect(body).toBe("body");
    expect(meta).toEqual({ tags: ["A", "B"] });
  });
});

describe("parsePage", () => {
  it("extracts the title and the h2/h3 outline with slugged ids", () => {
    const { title, headings } = parsePage("# Page\n\n## First\n\n### Nested\n\ntext");
    expect(title).toBe("Page");
    expect(headings).toEqual([
      { id: "first", level: 2, text: "First" },
      { id: "nested", level: 3, text: "Nested" },
    ]);
  });
});

describe("wikilink", () => {
  it("renders [[Target]] as an internal link carrying a data-slug", () => {
    const html = md.render("see [[Some Page]]");
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-slug="some-page"');
    expect(html).toContain(">Some Page<");
  });
  it("honours an explicit [[Target|Label]] label", () => {
    const html = md.render("[[home|Go home]]");
    expect(html).toContain('data-slug="home"');
    expect(html).toContain(">Go home<");
  });
  it("renders [[w:Title]] as an interwiki link out to Wikipedia", () => {
    const html = md.render("see [[w:Content delivery network]]");
    expect(html).toContain('class="wikilink interwiki"');
    expect(html).toContain(
      'href="https://en.wikipedia.org/wiki/Content_delivery_network"',
    );
    expect(html).toContain(">Content delivery network<");
    expect(html).not.toContain("data-slug");
  });
  it("supports the wikipedia: prefix and a custom label", () => {
    const html = md.render("[[wikipedia:Espresso|coffee]]");
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Espresso"');
    expect(html).toContain(">coffee<");
  });
});

describe("markRedLinksHtml", () => {
  it("marks links whose target is missing and leaves existing ones blue", () => {
    const html = md.render("[[getting-started]] and [[Ghost Page]]");
    const out = markRedLinksHtml(html, new Set(["getting-started"]));
    expect(out).toContain('class="wikilink" data-slug="getting-started"');
    expect(out).toContain('class="wikilink is-red"');
    expect(out).toContain('data-slug="ghost-page"');
  });
});

describe("parseDiff", () => {
  it("tracks line numbers and classes across a hunk", () => {
    const patch = [
      "diff --git a/x b/x",
      "index 111..222 100644",
      "--- a/x",
      "+++ b/x",
      "@@ -1,2 +1,2 @@",
      " kept",
      "-old",
      "+new",
    ].join("\n");
    const lines = parseDiff(patch);
    expect(lines.map((l) => l.cls)).toEqual(["hunk", "", "del", "add"]);
    expect(lines.find((l) => l.cls === "add")).toMatchObject({
      sign: "+",
      text: "new",
      num: "2",
    });
    expect(lines.find((l) => l.cls === "del")).toMatchObject({ sign: "-", num: "2" });
    expect(lines.find((l) => l.cls === "")).toMatchObject({ text: "kept", num: "1" });
  });
});

describe("search", () => {
  const docs = [
    {
      slug: "espresso",
      title: "Espresso",
      text: "A concentrated coffee brewed under pressure.",
    },
    {
      slug: "coffee",
      title: "Coffee",
      text: "A drink made from roasted beans, like espresso.",
    },
    { slug: "tea", title: "Tea", text: "A drink made by steeping leaves." },
  ];

  it("toPlainText strips markdown syntax but keeps heading text (searchable)", () => {
    expect(toPlainText("## Brewing\n\nA **bold** [link](/x) and [[Page|p]].")).toBe(
      "Brewing A bold link and p.",
    );
  });

  it("requires every term and boosts title matches over body matches", () => {
    const hits = search(docs, "espresso");
    expect(hits[0].slug).toBe("espresso"); // title hit outranks coffee's body hit
    expect(hits.map((h) => h.slug)).toContain("coffee");
    expect(hits.map((h) => h.slug)).not.toContain("tea");
  });

  it("returns a snippet with surrounding context", () => {
    const [hit] = search(docs, "roasted");
    expect(hit.slug).toBe("coffee");
    expect(hit.snippet).toContain("roasted");
  });

  it("AND-matches multi-term queries", () => {
    expect(search(docs, "drink leaves").map((h) => h.slug)).toEqual(["tea"]);
    expect(search(docs, "drink nonexistent")).toEqual([]);
  });

  it("splitHighlight flags matching runs case-insensitively", () => {
    expect(splitHighlight("Espresso is strong", "espresso")).toEqual([
      { t: "Espresso", hit: true },
      { t: " is strong", hit: false },
    ]);
  });

  it("slugifyQuery makes a safe slug", () => {
    expect(slugifyQuery("New Page Idea!")).toBe("new-page-idea");
  });
});
