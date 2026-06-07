import { describe, expect, it } from "vitest";
import {
  draftsForSlug,
  type NamedDraft,
  removeNamedDraft,
  sortedDrafts,
  upsertDraft,
} from "./draft";

const draft = (over: Partial<NamedDraft>): NamedDraft => ({
  id: "1",
  name: "Draft",
  slug: "page",
  content: "body",
  summary: "",
  savedAt: "2026-06-07T00:00:00.000Z",
  ...over,
});

describe("named draft list operations", () => {
  it("upserts newest-first and replaces by id in place", () => {
    const a = draft({ id: "a", savedAt: "2026-06-01T00:00:00.000Z" });
    const b = draft({ id: "b", savedAt: "2026-06-02T00:00:00.000Z" });
    const added = upsertDraft([a], b);
    expect(added.map((d) => d.id)).toEqual(["b", "a"]);

    const updated = upsertDraft(added, draft({ id: "a", name: "Renamed" }));
    expect(updated).toHaveLength(2); // replaced, not appended
    expect(updated[0].id).toBe("a");
    expect(updated[0].name).toBe("Renamed");
  });

  it("removes by id", () => {
    const list = [draft({ id: "a" }), draft({ id: "b" })];
    expect(removeNamedDraft(list, "a").map((d) => d.id)).toEqual(["b"]);
    expect(removeNamedDraft(list, "missing")).toHaveLength(2);
  });

  it("sorts newest-first by savedAt", () => {
    const older = draft({ id: "old", savedAt: "2026-06-01T00:00:00.000Z" });
    const newer = draft({ id: "new", savedAt: "2026-06-05T00:00:00.000Z" });
    expect(sortedDrafts([older, newer]).map((d) => d.id)).toEqual(["new", "old"]);
  });

  it("filters to one slug, newest-first", () => {
    const list = [
      draft({ id: "1", slug: "x", savedAt: "2026-06-01T00:00:00.000Z" }),
      draft({ id: "2", slug: "y" }),
      draft({ id: "3", slug: "x", savedAt: "2026-06-03T00:00:00.000Z" }),
    ];
    expect(draftsForSlug(list, "x").map((d) => d.id)).toEqual(["3", "1"]);
  });
});
