import { describe, expect, it } from "vitest";
import { parseModLog, replayModLog } from "./modlog";

describe("parseModLog", () => {
  it("parses patrol and tag lines, skipping blanks and garbage", () => {
    const raw = [
      '{"type":"patrol","sha":"abc123"}',
      "",
      "not json",
      '{"type":"tag","sha":"def456","tags":["spam","cleanup"]}',
      '{"type":"other","sha":"x"}', // unknown type → skipped
      '{"type":"patrol"}', // no sha → skipped
    ].join("\n");
    expect(parseModLog(raw)).toEqual([
      { type: "patrol", sha: "abc123" },
      { type: "tag", sha: "def456", tags: ["spam", "cleanup"] },
    ]);
  });

  it("returns [] for empty/undefined", () => {
    expect(parseModLog(undefined)).toEqual([]);
    expect(parseModLog("")).toEqual([]);
  });
});

describe("replayModLog", () => {
  it("folds entries into the KV keys the store expects", () => {
    const kv = replayModLog([
      { type: "patrol", sha: "abc" },
      { type: "tag", sha: "def", tags: ["spam"] },
    ]);
    expect(kv.get("patrol:abc")).toBe("1");
    expect(kv.get("tag:def")).toBe('["spam"]');
  });

  it("a later tag entry for a sha supersedes an earlier one", () => {
    const kv = replayModLog([
      { type: "tag", sha: "x", tags: ["a"] },
      { type: "tag", sha: "x", tags: ["a", "b"] },
    ]);
    expect(kv.get("tag:x")).toBe('["a","b"]');
  });

  it("round-trips parse → replay into a patrol bit the store can read", () => {
    const kv = replayModLog(parseModLog('{"type":"patrol","sha":"deadbeef"}'));
    expect(kv.get("patrol:deadbeef")).toBe("1");
  });
});
