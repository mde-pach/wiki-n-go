import { describe, expect, it } from "vitest";
import { PAGE_TEMPLATES, templateById } from "./templates";

describe("page templates", () => {
  it("defaults to the first template for unknown ids", () => {
    expect(templateById(undefined)).toBe(PAGE_TEMPLATES[0]);
    expect(templateById("nope")).toBe(PAGE_TEMPLATES[0]);
  });

  it("resolves a known id", () => {
    expect(templateById("guide").id).toBe("guide");
  });

  it("interpolates the title into the article lead", () => {
    expect(templateById("article").build("Quantum widgets")).toContain(
      "**Quantum widgets** is …",
    );
  });

  it("the blank template is empty", () => {
    expect(templateById("blank").build("Anything")).toBe("");
  });

  it("emits parseable frontmatter (managed keys)", () => {
    const md = templateById("article").build("Test");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("kicker: Article");
    expect(md).toContain("- Articles");
  });
});
