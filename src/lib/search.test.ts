import { describe, expect, it } from "vitest";
import { type SearchDoc, search, toPlainText } from "./search";

const docs: SearchDoc[] = [
  { slug: "coffee", title: "Coffee", text: "Coffee is a brewed drink from beans." },
  { slug: "espresso", title: "Espresso", text: "Espresso is concentrated coffee." },
  { slug: "tea", title: "Tea", text: "Tea is an infusion of leaves." },
  { slug: "coffee-guide", title: "Coffee brewing guide", text: "How to brew coffee." },
];

describe("search ranking", () => {
  it("returns nothing for an empty query", () => {
    expect(search(docs, "   ")).toEqual([]);
  });

  it("requires every term to appear (AND)", () => {
    expect(search(docs, "coffee leaves")).toEqual([]); // no doc has both
    expect(search(docs, "coffee beans").map((h) => h.slug)).toEqual(["coffee"]);
  });

  it("ranks an exact title match first", () => {
    const hits = search(docs, "coffee");
    expect(hits[0].slug).toBe("coffee"); // exact title beats body/partial title hits
  });

  it("boosts a title prefix over a body-only match", () => {
    const hits = search(docs, "espresso");
    expect(hits[0].slug).toBe("espresso"); // title hit ranks above coffee's body mention
  });

  it("honors the limit", () => {
    expect(search(docs, "coffee", 1)).toHaveLength(1);
  });

  it("produces a snippet around the first term", () => {
    const [hit] = search(docs, "infusion");
    expect(hit.slug).toBe("tea");
    expect(hit.snippet.toLowerCase()).toContain("infusion");
  });
});

describe("toPlainText", () => {
  it("strips fenced code, inline code, headings and markdown punctuation", () => {
    const md = "# Title\n\n```js\ncode()\n```\n\nSome **bold** and `inline` text.";
    const out = toPlainText(md);
    expect(out).not.toContain("```");
    expect(out).not.toContain("code()");
    expect(out).toContain("Some");
    expect(out).toContain("bold");
    expect(out).not.toContain("**");
  });
});
