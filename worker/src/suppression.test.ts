import { describe, expect, it } from "vitest";
import { makeRedactor, parseSuppressions } from "./suppression";

describe("parseSuppressions", () => {
  it("keeps only well-formed author/revision entries", () => {
    const raw = JSON.stringify([
      { type: "author", value: "anon-bad" },
      { type: "revision", value: "abc123", reason: "doxxing" },
      { type: "bogus", value: "x" },
      { type: "author" },
      "nope",
    ]);
    expect(parseSuppressions(raw)).toEqual([
      { type: "author", value: "anon-bad" },
      { type: "revision", value: "abc123", reason: "doxxing" },
    ]);
  });
  it("returns [] for missing or malformed input", () => {
    expect(parseSuppressions(undefined)).toEqual([]);
    expect(parseSuppressions("not json")).toEqual([]);
  });
});

describe("makeRedactor", () => {
  const redact = makeRedactor([
    { type: "author", value: "anon-bad" },
    { type: "revision", value: "deadbeef" },
  ]);
  it("masks a suppressed author, passes others through", () => {
    expect(redact.author("anon-bad")).toBe("[suppressed]");
    expect(redact.author("anon-ok")).toBe("anon-ok");
  });
  it("masks a suppressed revision's summary by sha", () => {
    expect(redact.revisionSummary("deadbeef", "nasty edit")).toBe("[suppressed]");
    expect(redact.revisionSummary("cafe", "fine edit")).toBe("fine edit");
  });
});
