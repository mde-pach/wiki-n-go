import { describe, expect, it } from "vitest";
import { b64urlEncode } from "./crypto";
import {
  buildClaims,
  normalizePrivateKey,
  pemToPkcs8Bytes,
  usingApp,
  wrapPkcs1ToPkcs8,
} from "./githubApp";

// A real 512-bit PKCS#1 key (test-only), the format GitHub's manifest flow returns.
const PKCS1_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBALVh4ios5EUmPMWZh4q0Yb/bLxhoG9UTq4WzNtXVHq8wOf1USuzW
lc0TKIGmNTqPr+Fh66Qir56ofAABbdCQF+cCAwEAAQJBAKaOX7QCzQqCdkOtG73O
rgQTLUfoMcaT7Wk0jCIHNcn/nygpnnj8WjUaK+012g10pO2dOlorHt0Etrdfwxwm
3eECIQDcSIcwni8TUTXeOGhWXmRo7x9X8FsGqTEPeUSTnDcwDQIhANLKqbdQ+TSD
GC1G79/DyozamWQLSPURsnx8kZ9DQvbDAiBIkKfgLyvIzEbXhnNwiDXBj4wetvH1
dsTPmR4rFhnj/QIhAJ+IQmo7HmBf1yxtQ55W0DVKPE07PTw86JjOrmeawFOBAiB9
DJPdlG5QQzgJkaj/LtI377B/tWYOuCEzTRtzak7kiQ==
-----END RSA PRIVATE KEY-----`;

describe("buildClaims", () => {
  it("backdates iat, caps exp under 10 min, sets iss to the app id", () => {
    const now = 1_700_000_000;
    const c = buildClaims("12345", now);
    expect(c.iss).toBe("12345");
    expect(c.iat).toBe(now - 30);
    expect(c.exp - c.iat).toBeLessThanOrEqual(600);
    expect(c.exp).toBeGreaterThan(now);
  });
});

describe("pemToPkcs8Bytes", () => {
  it("passes a PKCS#8 key through, stripping armor", () => {
    const der = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = btoa(String.fromCharCode(...der));
    const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
    expect([...pemToPkcs8Bytes(pem)]).toEqual([...der]);
  });

  it("wraps GitHub's PKCS#1 key so WebCrypto can import and sign with it", async () => {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(PKCS1_PEM),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode("hello"),
    );
    expect(sig.byteLength).toBe(64); // 512-bit key → 64-byte signature
  });

  it("emits a valid DER length for a body over 127 bytes (long form)", () => {
    const big = new Uint8Array(200).fill(0x41);
    const wrapped = wrapPkcs1ToPkcs8(big);
    expect(wrapped[0]).toBe(0x30); // outer SEQUENCE
    expect(wrapped[1]).toBe(0x81); // long-form length, 1 octet follows
  });
});

describe("normalizePrivateKey", () => {
  it("passes a real multi-line PEM through unchanged", () => {
    expect(normalizePrivateKey(PKCS1_PEM)).toBe(PKCS1_PEM);
  });

  it("restores newlines from a single-line, \\n-escaped PEM", () => {
    const escaped = PKCS1_PEM.replace(/\n/g, "\\n");
    expect(normalizePrivateKey(escaped)).toBe(PKCS1_PEM);
  });

  it("decodes a base64-encoded PEM (CI/Docker-arg safe form)", () => {
    const b64 = btoa(PKCS1_PEM);
    expect(normalizePrivateKey(b64)).toBe(PKCS1_PEM);
  });

  it("imports a key delivered base64-encoded", async () => {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(normalizePrivateKey(btoa(PKCS1_PEM))),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode("hello"),
    );
    expect(sig.byteLength).toBe(64);
  });
});

describe("usingApp", () => {
  const env = (extra: Record<string, string>) =>
    ({ REPO_NAME: "w", HASH_SECRET: "s", ...extra }) as unknown as Parameters<
      typeof usingApp
    >[0];
  it("is true only when both app id and private key are present", () => {
    expect(usingApp(env({ GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "k" }))).toBe(
      true,
    );
    expect(usingApp(env({ GITHUB_APP_ID: "1" }))).toBe(false);
    expect(usingApp(env({ GITHUB_TOKEN: "pat" }))).toBe(false);
  });
});

// b64urlEncode is the JWT segment encoder; guard the url-safe alphabet + no pad.
describe("b64urlEncode", () => {
  it("emits url-safe base64 without padding", () => {
    const out = b64urlEncode(new TextEncoder().encode("?>?>?>"));
    expect(out).not.toMatch(/[+/=]/);
  });
});
