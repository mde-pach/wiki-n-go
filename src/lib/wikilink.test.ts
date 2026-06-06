import { describe, expect, it } from "vitest";
import { md } from "./markdown";

const render = (src: string) => md.renderInline(src);

describe("@mention linkify", () => {
  it("links an anon pseudonym to its contributions filter", () => {
    const html = render("thanks @anon-3f9a2c");
    expect(html).toContain('href="/changes?author=anon-3f9a2c"');
    expect(html).toContain('class="mention mention-anon"');
    expect(html).toContain("@anon-3f9a2c");
  });

  it("links a GitHub login to its in-site profile page", () => {
    const html = render("cc @octocat");
    expect(html).toContain('href="/user/octocat"');
    expect(html).toContain('class="mention mention-user"');
    expect(html).not.toContain('target="_blank"');
  });

  it("does not fire inside an email address", () => {
    const html = render("mail me@example.com please");
    expect(html).not.toContain('class="mention');
    expect(html).toContain("me@example.com");
  });

  it("does not fire inside a code span", () => {
    const html = render("the `@handle` token");
    expect(html).not.toContain('class="mention');
  });

  it("ignores a bare @ with no valid handle", () => {
    expect(render("a @ b")).not.toContain('class="mention');
    expect(render("e@ -leading")).not.toContain('class="mention');
  });
});
