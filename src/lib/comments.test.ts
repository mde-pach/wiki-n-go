import { describe, expect, it } from "vitest";
import { type Comment, childrenOf } from "./comments";

const c = (id: string, replyTo: string | null, isAnon = false): Comment => ({
  id,
  author: isAnon ? `anon-${id}` : id,
  isAnon,
  avatarUrl: null,
  bodyHtml: id,
  createdAt: "2026-01-01",
  url: `#${id}`,
  replyTo,
});

describe("childrenOf (reply-to tree rebuild)", () => {
  // a (root) ├ b ─ d ; c is a second top-level; e is an orphan (parent gone)
  const all = [
    c("a", null, true),
    c("b", "a"),
    c("c", null),
    c("d", "b", true),
    c("e", "missing-parent"),
  ];

  it("treats null-parent and orphaned comments as top-level at the root", () => {
    const ids = childrenOf(all[0], true, all).map((x) => x.id);
    // a + c (null parent) + e (orphan) — never dropped — plus b which points at a.
    expect(ids.sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("returns only direct children below the root", () => {
    expect(childrenOf(c("a", null), false, all).map((x) => x.id)).toEqual(["b"]);
    expect(childrenOf(c("b", "a"), false, all).map((x) => x.id)).toEqual(["d"]);
  });

  it("never drops a comment whose parent was deleted (orphan attaches to root)", () => {
    const rootIds = childrenOf(all[0], true, all).map((x) => x.id);
    expect(rootIds).toContain("e");
  });

  it("mixes anon and signed-in nodes transparently", () => {
    const kids = childrenOf(all[0], true, all);
    expect(kids.find((x) => x.id === "a")?.isAnon).toBe(true);
    expect(kids.find((x) => x.id === "c")?.isAnon).toBe(false);
  });

  it("a leaf has no children", () => {
    expect(childrenOf(c("d", "b"), false, all)).toEqual([]);
  });
});
