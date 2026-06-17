import { describe, expect, test } from "bun:test";
import { isAllowedRedirect } from "./redirect";

describe("isAllowedRedirect", () => {
  test("accepts the federation apex and its subdomains over https", () => {
    expect(isAllowedRedirect("https://wikigit.org/auth/callback")).toBe(true);
    expect(isAllowedRedirect("https://fr.wikigit.org/auth/callback")).toBe(true);
    expect(isAllowedRedirect("https://a.b.wikigit.org/")).toBe(true);
  });

  test("accepts http://localhost for dev", () => {
    expect(isAllowedRedirect("http://localhost:4321/auth/callback")).toBe(true);
  });

  test("rejects arbitrary external hosts (the open-redirect / code-theft case)", () => {
    expect(isAllowedRedirect("https://evil.example/auth/callback")).toBe(false);
    expect(isAllowedRedirect("https://evil.com/")).toBe(false);
  });

  test("rejects look-alikes that only suffix-match the bare name", () => {
    expect(isAllowedRedirect("https://notwikigit.org/")).toBe(false);
    expect(isAllowedRedirect("https://wikigit.org.evil.com/")).toBe(false);
    expect(isAllowedRedirect("https://evilwikigit.org/")).toBe(false);
  });

  test("rejects non-https (except localhost) and malformed input", () => {
    expect(isAllowedRedirect("http://wikigit.org/")).toBe(false);
    expect(isAllowedRedirect("ftp://wikigit.org/")).toBe(false);
    expect(isAllowedRedirect("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirect("not a url")).toBe(false);
  });
});
