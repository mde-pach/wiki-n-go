import { describe, expect, it } from "vitest";
import {
  banApplies,
  banExpired,
  normalizeBan,
  parseBans,
  parseExpiry,
  serializeBan,
} from "./bans";

describe("ban expiry (P2-2)", () => {
  const now = Date.parse("2026-06-14T00:00:00Z");

  it("parseExpiry turns a duration into a future ISO timestamp", () => {
    expect(parseExpiry("24h", now)).toBe("2026-06-15T00:00:00.000Z");
    expect(parseExpiry("7d", now)).toBe("2026-06-21T00:00:00.000Z");
    expect(parseExpiry("2w", now)).toBe("2026-06-28T00:00:00.000Z");
    expect(parseExpiry("90m", now)).toBe("2026-06-14T01:30:00.000Z");
  });

  it("parseExpiry passes through an absolute ISO date and rejects junk", () => {
    expect(parseExpiry("2026-07-01T12:00:00Z", now)).toBe("2026-07-01T12:00:00.000Z");
    expect(parseExpiry("", now)).toBeUndefined();
    expect(parseExpiry("soon", now)).toBeUndefined();
  });

  it("banExpired is true only once the timestamp is past", () => {
    const b = normalizeBan({ key: "x", expires: "2026-06-14T01:00:00Z" });
    expect(banExpired(b, now)).toBe(false);
    expect(banExpired(b, now + 3_600_001)).toBe(true);
  });

  it("an indefinite ban (no expires) never expires", () => {
    expect(banExpired(normalizeBan("x"), now)).toBe(false);
  });

  it("banApplies ignores an expired ban", () => {
    const expired = normalizeBan({ key: "x", expires: "2020-01-01T00:00:00Z" });
    expect(banApplies(expired, "x")).toBe(false);
  });

  it("serializeBan round-trips expires", () => {
    const b = normalizeBan({ key: "x", expires: "2026-07-01T00:00:00.000Z" });
    expect(serializeBan(b)).toEqual({ key: "x", expires: "2026-07-01T00:00:00.000Z" });
  });
});

describe("normalizeBan", () => {
  it("treats a bare string as a site-wide block", () => {
    expect(normalizeBan("anon-abc")).toEqual({ key: "anon-abc", paths: [] });
  });
  it("keeps object metadata", () => {
    expect(
      normalizeBan({ key: "anon-abc", paths: ["foo"], reason: "spam" }),
    ).toMatchObject({ key: "anon-abc", paths: ["foo"], reason: "spam" });
  });
});

describe("serializeBan", () => {
  it("compacts a bare site-wide ban back to a string", () => {
    expect(serializeBan({ key: "anon-abc", paths: [] })).toBe("anon-abc");
  });
  it("keeps an object when scoped or annotated", () => {
    expect(serializeBan({ key: "k", paths: ["foo"] })).toEqual({
      key: "k",
      paths: ["foo"],
    });
    expect(serializeBan({ key: "k", paths: [], reason: "r" })).toEqual({
      key: "k",
      reason: "r",
    });
  });
});

describe("banApplies", () => {
  const sitewide = normalizeBan("anon-abc");
  const partial = normalizeBan({ key: "anon-abc", paths: ["docs", "blog/2024"] });

  it("ignores entries for a different key", () => {
    expect(banApplies(sitewide, "anon-xyz", "docs")).toBe(false);
  });
  it("site-wide blocks any path, and even a path-less action", () => {
    expect(banApplies(sitewide, "anon-abc", "anything")).toBe(true);
    expect(banApplies(sitewide, "anon-abc", undefined)).toBe(true);
  });
  it("partial blocks only its subtrees", () => {
    expect(banApplies(partial, "anon-abc", "docs")).toBe(true);
    expect(banApplies(partial, "anon-abc", "docs/install")).toBe(true);
    expect(banApplies(partial, "anon-abc", "blog/2024/post")).toBe(true);
    expect(banApplies(partial, "anon-abc", "blog/2025/post")).toBe(false);
    expect(banApplies(partial, "anon-abc", "home")).toBe(false);
  });
  it("a partial block never applies to a path-less action (e.g. a comment)", () => {
    expect(banApplies(partial, "anon-abc", undefined)).toBe(false);
  });
});

describe("parseBans", () => {
  it("returns [] for missing or malformed input", () => {
    expect(parseBans(undefined)).toEqual([]);
    expect(parseBans("not json")).toEqual([]);
    expect(parseBans('{"not":"an array"}')).toEqual([]);
  });
  it("normalizes a mixed string/object list", () => {
    expect(parseBans('["a", {"key":"b","paths":["x"]}]')).toEqual([
      { key: "a", paths: [] },
      { key: "b", paths: ["x"], reason: undefined, by: undefined, at: undefined },
    ]);
  });
});
