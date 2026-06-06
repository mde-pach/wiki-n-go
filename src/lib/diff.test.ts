import { describe, expect, it } from "vitest";
import { diffLines, diffStats, parseDiff, splitDiff, wordDiff } from "./diff";

const PATCH = `diff --git a/x.md b/x.md
index 1111111..2222222 100644
--- a/x.md
+++ b/x.md
@@ -1,4 +1,4 @@
 line one
-old second line
+new second line
 line three
 line four
`;

describe("parseDiff", () => {
  const lines = parseDiff(PATCH);

  it("drops file headers and keeps only hunk/context/add/del lines", () => {
    expect(lines.some((l) => l.text.startsWith("diff "))).toBe(false);
    expect(lines.some((l) => l.text.startsWith("index "))).toBe(false);
    expect(lines.some((l) => l.text.startsWith("---"))).toBe(false);
    expect(lines.some((l) => l.text.startsWith("+++"))).toBe(false);
  });

  it("classes each line and strips the +/-/space sign from the text", () => {
    // The patch's trailing newline yields one empty context line at the end.
    expect(lines.map((l) => l.cls)).toEqual(["hunk", "", "del", "add", "", "", ""]);
    expect(lines[2]).toMatchObject({ sign: "-", text: "old second line" });
    expect(lines[3]).toMatchObject({ sign: "+", text: "new second line" });
    expect(lines[4].text).toBe("line three");
  });

  it("tracks old/new line numbers across the hunk", () => {
    const del = lines[2];
    const add = lines[3];
    expect(del).toMatchObject({ onum: "2", nnum: "" });
    expect(add).toMatchObject({ onum: "", nnum: "2" });
    expect(lines[5]).toMatchObject({ onum: "4", nnum: "4" });
  });

  it("re-seeds numbering from each hunk header", () => {
    const multi = parseDiff("@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +20,1 @@\n-c\n+d\n");
    const dels = multi.filter((l) => l.cls === "del");
    expect(dels.map((l) => l.onum)).toEqual(["1", "10"]);
    const adds = multi.filter((l) => l.cls === "add");
    expect(adds.map((l) => l.nnum)).toEqual(["1", "20"]);
  });
});

describe("diffStats", () => {
  it("counts added and removed lines", () => {
    expect(diffStats(parseDiff(PATCH))).toEqual({ add: 1, del: 1 });
  });

  it("is zero for a context-only patch", () => {
    expect(diffStats(parseDiff("@@ -1,1 +1,1 @@\n unchanged\n"))).toEqual({
      add: 0,
      del: 0,
    });
  });
});

describe("splitDiff", () => {
  it("pairs a removed+added line into one change row with both numbers", () => {
    const rows = splitDiff(parseDiff(PATCH));
    const change = rows.find((r) => r.cls === "change");
    expect(change?.left?.num).toBe("2");
    expect(change?.right?.num).toBe("2");
  });

  it("mirrors context lines onto both sides", () => {
    const rows = splitDiff(parseDiff(PATCH));
    const ctx = rows.find((r) => r.cls === "context");
    expect(ctx?.left?.num).toBe("1");
    expect(ctx?.right?.num).toBe("1");
    expect(ctx?.left?.segs[0].t).toBe("line one");
  });

  it("leaves a blank cell opposite an unpaired add or del", () => {
    const added = splitDiff(parseDiff("@@ -1,0 +1,1 @@\n+brand new\n"));
    const row = added.find((r) => r.cls === "add");
    expect(row?.left).toBeNull();
    expect(row?.right?.segs[0].t).toBe("brand new");

    const removed = splitDiff(parseDiff("@@ -1,1 +1,0 @@\n-gone\n"));
    const drow = removed.find((r) => r.cls === "del");
    expect(drow?.right).toBeNull();
    expect(drow?.left?.segs[0].t).toBe("gone");
  });

  it("passes hunk headers through as their own row", () => {
    const rows = splitDiff(parseDiff(PATCH));
    expect(rows[0]).toMatchObject({ cls: "hunk" });
    expect(rows[0].left).toBeNull();
    expect(rows[0].right).toBeNull();
  });
});

describe("wordDiff", () => {
  it("highlights only the changed words, leaving the shared run intact", () => {
    const { left, right } = wordDiff("old second line", "new second line");
    expect(left.map((s) => s.t).join("")).toBe("old second line");
    expect(right.map((s) => s.t).join("")).toBe("new second line");
    expect(left.find((s) => s.changed)?.t).toBe("old");
    expect(right.find((s) => s.changed)?.t).toBe("new");
    expect(
      left
        .filter((s) => !s.changed)
        .map((s) => s.t)
        .join(""),
    ).toBe(" second line");
  });

  it("marks the whole right side changed when nothing is shared", () => {
    const { left, right } = wordDiff("", "added text");
    expect(left).toEqual([]);
    expect(right).toEqual([{ t: "added text", changed: true }]);
  });

  it("coalesces adjacent same-state tokens into one segment", () => {
    const { right } = wordDiff("a", "a b c");
    expect(right.filter((s) => s.changed).length).toBe(1);
    expect(right.find((s) => s.changed)?.t).toBe(" b c");
  });
});

describe("diffLines", () => {
  it("returns an empty array when the documents are identical", () => {
    expect(diffLines("a\nb\nc", "a\nb\nc")).toEqual([]);
  });

  it("emits a del+add pair for a changed line, with line numbers", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc");
    expect(diffStats(lines)).toEqual({ add: 1, del: 1 });
    const del = lines.find((l) => l.cls === "del");
    const add = lines.find((l) => l.cls === "add");
    expect(del).toMatchObject({ text: "b", onum: "2", nnum: "" });
    expect(add).toMatchObject({ text: "B", onum: "", nnum: "2" });
    // Feeds straight into the side-by-side reshaper as a word-diffed change row.
    expect(splitDiff(lines).some((r) => r.cls === "change")).toBe(true);
  });

  it("treats an empty original as all-additions (new page)", () => {
    const lines = diffLines("", "x\ny");
    expect(diffStats(lines)).toEqual({ add: 2, del: 0 });
    expect(lines.every((l) => l.cls === "add")).toBe(true);
  });

  it("collapses long unchanged runs into a counted hunk separator", () => {
    const before = Array.from({ length: 12 }, (_, k) => `line ${k}`).join("\n");
    const after = before.replace("line 6", "LINE 6");
    const lines = diffLines(before, after, 2);
    const hunks = lines.filter((l) => l.cls === "hunk");
    expect(hunks.length).toBeGreaterThan(0);
    expect(hunks[0].text).toMatch(/^⋯ \d+ unchanged lines? ⋯$/);
    // Only ~2 context lines survive on each side of the single change.
    expect(lines.filter((l) => l.cls === "").length).toBeLessThanOrEqual(4);
  });

  it("keeps short unchanged runs intact (no separator)", () => {
    const lines = diffLines("a\nb\nc", "a\nX\nc", 3);
    expect(lines.some((l) => l.cls === "hunk")).toBe(false);
  });
});
