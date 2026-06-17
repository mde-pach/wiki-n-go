import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, timingSafeEq } from "./crypto";

describe("timingSafeEq", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEq("abc123", "abc123")).toBe(true);
    expect(timingSafeEq("abc123", "abc124")).toBe(false);
  });
  it("returns false on a length mismatch (the early-out branch)", () => {
    expect(timingSafeEq("abc", "abcd")).toBe(false);
    expect(timingSafeEq("", "x")).toBe(false);
    expect(timingSafeEq("", "")).toBe(true);
  });
});

describe("b64url round-trip", () => {
  it("encodes and decodes bytes losslessly without padding", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const enc = b64urlEncode(bytes);
    expect(enc).not.toMatch(/[+/=]/); // url-safe alphabet, no padding
    expect([...b64urlDecode(enc)]).toEqual([...bytes]);
  });
});
