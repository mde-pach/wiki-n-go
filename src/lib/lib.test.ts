import { describe, expect, it } from "vitest";
import { diffStats, parseDiff, splitDiff, wordDiff } from "./diff";
import { computeGraph, graphStats, mostLinked } from "./linkgraph";
import { emphasizeLeadHtml, md, parsePage, splitTitle } from "./markdown";
import { prettify, slugifyLabel, slugifyPath } from "./paths";
import { search, splitHighlight, toPlainText } from "./search";
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

describe("emphasizeLeadHtml", () => {
  it("bolds the title when the lead opens with it", () => {
    expect(emphasizeLeadHtml("<p>Espresso is a coffee.</p>", "Espresso")).toBe(
      "<p><strong>Espresso</strong> is a coffee.</p>",
    );
  });
  it("leaves the lead alone when it doesn't start with the title", () => {
    const html = "<p>A drink brewed under pressure.</p>";
    expect(emphasizeLeadHtml(html, "Espresso")).toBe(html);
  });
  it("doesn't double-bold an already-emphasized lead", () => {
    const html = "<p><strong>Espresso</strong> is a coffee.</p>";
    expect(emphasizeLeadHtml(html, "Espresso")).toBe(html);
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

  it("tracks separate old/new line numbers for the split view", () => {
    const lines = parseDiff("@@ -3,2 +3,2 @@\n ctx\n-gone\n+added");
    expect(lines.find((l) => l.cls === "")).toMatchObject({ onum: "3", nnum: "3" });
    expect(lines.find((l) => l.cls === "del")).toMatchObject({ onum: "4", nnum: "" });
    expect(lines.find((l) => l.cls === "add")).toMatchObject({ onum: "", nnum: "4" });
  });
});

describe("diff split + word diff", () => {
  it("diffStats counts additions and removals", () => {
    const lines = parseDiff("@@ -1,2 +1,2 @@\n kept\n-old\n+new\n+extra");
    expect(diffStats(lines)).toEqual({ add: 2, del: 1 });
  });

  it("pairs a removed line with the next added line into one change row", () => {
    const rows = splitDiff(parseDiff("@@ -1,1 +1,1 @@\n-the quick fox\n+the slow fox"));
    expect(rows[0].cls).toBe("hunk");
    const change = rows.find((r) => r.cls === "change");
    expect(change?.left?.num).toBe("1");
    expect(change?.right?.num).toBe("1");
  });

  it("leaves a blank cell opposite an unpaired add/del", () => {
    const rows = splitDiff(parseDiff("@@ -1,1 +1,2 @@\n ctx\n+brand new"));
    const addRow = rows.find((r) => r.cls === "add");
    expect(addRow?.left).toBeNull();
    expect(addRow?.right?.segs[0]).toEqual({ t: "brand new", changed: true });
  });

  it("wordDiff highlights only the changed words", () => {
    const { left, right } = wordDiff("the quick brown fox", "the slow brown fox");
    expect(left.filter((s) => s.changed).map((s) => s.t)).toEqual(["quick"]);
    expect(right.filter((s) => s.changed).map((s) => s.t)).toEqual(["slow"]);
    expect(left.find((s) => !s.changed)?.t).toBe("the ");
  });
});

describe("computeGraph", () => {
  const g = computeGraph(
    [
      { slug: "index", title: "Home", out: ["getting-started", "example-draft"] },
      { slug: "getting-started", title: "Getting started", out: [] },
      { slug: "sandbox/playground", title: "Playground", out: [] },
    ],
    "index",
  );

  it("inverts links into backlinks", () => {
    expect(g.backlinks["getting-started"]).toEqual(["index"]);
  });
  it("lists wanted (linked-but-missing) pages with their sources", () => {
    expect(g.wanted).toEqual([{ slug: "example-draft", by: ["index"] }]);
  });
  it("finds orphans with no incoming links, excluding the home page", () => {
    expect(g.orphans).toEqual(["sandbox/playground"]);
  });
  it("finds dead-end pages with no outgoing internal links", () => {
    expect(g.deadends).toEqual(["getting-started", "sandbox/playground"]);
  });

  it("flags broken and double redirects, and excludes redirects from orphans", () => {
    const r = computeGraph(
      [
        { slug: "home", title: "Home", out: ["real"] },
        { slug: "real", title: "Real", out: [] },
        { slug: "lonely", title: "Lonely", out: [] },
        { slug: "alias", title: "Alias", out: [], redirect: "real" },
        { slug: "hop", title: "Hop", out: [], redirect: "alias" },
        { slug: "gone", title: "Gone", out: [], redirect: "missing" },
      ],
      "home",
    );
    expect(r.redirects).toEqual([
      { from: "alias", to: "real", broken: false, double: false },
      { from: "gone", to: "missing", broken: true, double: false },
      { from: "hop", to: "alias", broken: false, double: true },
    ]);
    // redirect pages (alias/hop/gone) are excluded from orphan/dead-end reports
    expect(r.orphans).toEqual(["lonely"]);
    expect(r.deadends).toEqual(["lonely", "real"]);
  });
});

describe("graph reports (stats + most-linked)", () => {
  const g = computeGraph(
    [
      { slug: "index", title: "Home", out: ["a", "b", "ghost"] },
      { slug: "a", title: "A", out: ["b"] },
      { slug: "b", title: "B", out: [] },
      { slug: "alias", title: "Alias", out: [], redirect: "a" },
    ],
    "index",
  );

  it("graphStats counts pages, redirects, links and reports", () => {
    expect(graphStats(g)).toEqual({
      pages: 3, // index, a, b (alias is a redirect)
      redirects: 1,
      links: 4, // a←index, b←index, b←a (resolved) + ghost←index (wanted)
      wanted: 1,
      orphans: 0,
      deadends: 1, // b
    });
  });

  it("mostLinked ranks targets by incoming link count", () => {
    expect(mostLinked(g)).toEqual([
      { slug: "b", count: 2 },
      { slug: "a", count: 1 },
    ]);
  });
});

describe("slugifyPath", () => {
  it("lowercases, dashes spaces, keeps slashes for nested paths", () => {
    expect(slugifyPath("Getting Started")).toBe("getting-started");
    expect(slugifyPath("Sandbox/Play Ground")).toBe("sandbox/play-ground");
  });
});

describe("slugifyLabel", () => {
  it("lowercases, dashes spaces, drops slashes", () => {
    expect(slugifyLabel("Wiki software")).toBe("wiki-software");
    expect(slugifyLabel("A/B testing")).toBe("ab-testing");
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

  it("slugifyPath makes a safe slug", () => {
    expect(slugifyPath("New Page Idea!")).toBe("new-page-idea");
  });
});
