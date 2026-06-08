import { describe, expect, it } from "vitest";
import { originAllowed } from "./http";
import type { Env } from "./types";

const env = (allowed: string): Env => ({ ALLOWED_ORIGIN: allowed }) as unknown as Env;

describe("originAllowed", () => {
  it("matches exact origins", () => {
    expect(originAllowed(env("https://wikigit.org"), "https://wikigit.org")).toBe(true);
    expect(originAllowed(env("https://wikigit.org"), "https://evil.com")).toBe(false);
  });

  it("matches *.wikigit.org subdomains, not the apex or lookalikes", () => {
    const e = env("https://*.wikigit.org");
    expect(originAllowed(e, "https://my-custom.wikigit.org")).toBe(true);
    expect(originAllowed(e, "https://a.b.wikigit.org")).toBe(true);
    expect(originAllowed(e, "https://wikigit.org")).toBe(false); // apex: needs its own entry
    expect(originAllowed(e, "https://evilwikigit.org")).toBe(false); // suffix lookalike
    expect(originAllowed(e, "http://my-custom.wikigit.org")).toBe(false); // scheme mismatch
  });

  it("supports apex + wildcard together", () => {
    const e = env("https://wikigit.org,https://*.wikigit.org");
    expect(originAllowed(e, "https://wikigit.org")).toBe(true);
    expect(originAllowed(e, "https://x.wikigit.org")).toBe(true);
  });

  it("empty allowlist allows any (dev / unconfigured)", () => {
    expect(originAllowed(env(""), "https://anything.com")).toBe(true);
  });
});
