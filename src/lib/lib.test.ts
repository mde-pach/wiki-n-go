import { describe, expect, it } from "vitest";
import { parseDiff } from "./diff";
import { md, parsePage, splitTitle } from "./markdown";
import { prettify } from "./paths";

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
