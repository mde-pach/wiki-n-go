import { describe, expect, it } from "vitest";
import { authorOf, participantKeyOf } from "./comments";

const anon = "<!-- anon:anon-1a2b -->\n\nhi";
const gh = "<!-- gh:octocat|https://a/o.png -->\n\nhi";
const wg = "<!-- wg:sub-9|https://a/w.png|Alice -->\n\nhi";

describe("authorOf", () => {
  it("reads an anonymous marker", () => {
    expect(authorOf(anon, null)).toEqual({
      author: "anon-1a2b",
      isAnon: true,
      avatarUrl: null,
    });
  });
  it("reads a gh marker (login + avatar)", () => {
    expect(authorOf(gh, null)).toEqual({
      author: "octocat",
      isAnon: false,
      avatarUrl: "https://a/o.png",
    });
  });
  it("reads a wg marker as the handle, not the sub", () => {
    expect(authorOf(wg, null)).toEqual({
      author: "Alice",
      isAnon: false,
      avatarUrl: "https://a/w.png",
    });
  });
  it("falls back to the real GitHub author when unmarked", () => {
    expect(authorOf("plain body", { login: "ghost", avatarUrl: "x" })).toEqual({
      author: "ghost",
      isAnon: false,
      avatarUrl: "x",
    });
  });
});

describe("participantKeyOf", () => {
  it("recovers the provider-qualified routing key", () => {
    expect(participantKeyOf(anon)).toBe("anon-1a2b");
    expect(participantKeyOf(gh)).toBe("gh:octocat");
    expect(participantKeyOf(wg)).toBe("wg:sub-9"); // the sub, never the handle
  });
  it("returns null for an unmarked (bot/legacy) comment", () => {
    expect(participantKeyOf("just text")).toBeNull();
  });
});
