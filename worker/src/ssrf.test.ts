import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "./http";
import { assertFetchableUrl, fetchGuarded, isBlockedHost } from "./ssrf";

afterEach(() => vi.unstubAllGlobals());

describe("isBlockedHost", () => {
  const blocked = [
    "localhost",
    "foo.localhost",
    "service.internal",
    "db.local",
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "100.64.0.1", // CGNAT
    "2130706433", // decimal 127.0.0.1
    "2852039166", // decimal 169.254.169.254
    "0x7f000001", // hex 127.0.0.1
    "0177.0.0.1", // octal 127.x
    "127.1", // short form 127.0.0.1
    "[::1]",
    "[::ffff:127.0.0.1]", // IPv4-mapped loopback
    "[fc00::1]", // unique-local
    "[fe80::1]", // link-local
  ];
  for (const h of blocked) {
    it(`blocks ${h}`, () => expect(isBlockedHost(h)).toBe(true));
  }

  const allowed = [
    "example.com",
    "en.wikipedia.org",
    "8.8.8.8",
    "1.1.1.1",
    "[2606:4700:4700::1111]", // public IPv6
  ];
  for (const h of allowed) {
    it(`allows ${h}`, () => expect(isBlockedHost(h)).toBe(false));
  }
});

describe("assertFetchableUrl", () => {
  it("rejects non-http(s) schemes", () => {
    expect(() => assertFetchableUrl("file:///etc/passwd")).toThrow(HttpError);
    expect(() => assertFetchableUrl("gopher://x")).toThrow(HttpError);
  });
  it("rejects a decimal-IP loopback URL", () => {
    expect(() => assertFetchableUrl("http://2130706433/")).toThrow(/private address/);
  });
  it("rejects the metadata IP", () => {
    expect(() => assertFetchableUrl("http://169.254.169.254/latest/")).toThrow(
      /private address/,
    );
  });
  it("accepts a normal URL", () => {
    expect(assertFetchableUrl("https://example.com/x").hostname).toBe("example.com");
  });
});

describe("fetchGuarded", () => {
  it("re-validates redirect hops and refuses a bounce to a private address", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    await expect(fetchGuarded("https://example.com/redirector", {})).rejects.toThrow(
      /private address/,
    );
  });

  it("follows a redirect to another public URL", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("start"))
        return new Response(null, {
          status: 301,
          headers: { location: "https://example.org/final" },
        });
      return new Response("<title>ok</title>", { status: 200 });
    });
    const { res, finalUrl } = await fetchGuarded("https://example.com/start", {});
    expect(res.status).toBe(200);
    expect(finalUrl).toBe("https://example.org/final");
    expect(seen).toEqual(["https://example.com/start", "https://example.org/final"]);
  });

  it("returns a non-redirect response directly", async () => {
    vi.stubGlobal("fetch", async () => new Response("body", { status: 200 }));
    const { res, finalUrl } = await fetchGuarded("https://example.com/page", {});
    expect(res.status).toBe(200);
    expect(finalUrl).toBe("https://example.com/page");
  });

  it("caps redirect chains", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const n = Number(new URL(String(input)).searchParams.get("n") ?? "0");
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/?n=${n + 1}` },
      });
    });
    await expect(fetchGuarded("https://example.com/?n=0", {})).rejects.toThrow(
      /Too many redirects/,
    );
  });
});
