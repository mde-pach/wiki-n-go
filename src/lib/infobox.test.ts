import { describe, expect, it } from "vitest";
import { infoboxHtml, safeUrl } from "./infobox";

describe("safeUrl", () => {
  it("allows http(s), mailto, relative, root/protocol-relative, anchor", () => {
    for (const u of [
      "https://example.com",
      "http://example.com/x?y=1",
      "mailto:a@b.com",
      "/local/path",
      "//cdn.example.com/x.png",
      "relative/path",
      "#section",
      "?q=1",
    ]) {
      expect(safeUrl(u)).toBe(u);
    }
  });

  it("drops script-bearing and other dangerous schemes", () => {
    for (const u of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)", // tab inside scheme — not a valid http(s) scheme
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeUrl(u)).toBeUndefined();
    }
  });
});

describe("infoboxHtml XSS hardening", () => {
  it("renders a javascript: row link as a plain span, not an href", () => {
    const html = infoboxHtml("page", {
      infobox: { Site: { v: "Evil", link: "javascript:alert(document.cookie)" } },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("href=");
    expect(html).toContain("<span>Evil</span>");
  });

  it("keeps a safe row link as an anchor", () => {
    const html = infoboxHtml("page", {
      infobox: { Home: { v: "Example", link: "https://example.com" } },
    });
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("never emits an <img> for a javascript:/data: image url", () => {
    const html = infoboxHtml("page", {
      image: "javascript:alert(1)",
      infobox: { A: "b" },
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain("img-placeholder");
  });

  it("emits an <img> for a real image url", () => {
    const html = infoboxHtml("page", {
      image: "https://example.com/pic.png",
      infobox: { A: "b" },
    });
    expect(html).toContain('<img src="https://example.com/pic.png"');
  });

  it("still entity-escapes text fields", () => {
    const html = infoboxHtml("page", {
      infobox: { '<x>"&': { v: "<b>bold</b>" } },
    });
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("returns empty string when there are no infobox rows", () => {
    expect(infoboxHtml("page", {})).toBe("");
  });
});
