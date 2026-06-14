import { describe, expect, it } from "vitest";
import { buildChecklist, type FirstRunState } from "./first-run";

const base: FirstRunState = { pages: 1, maintainers: 0, signinAvailable: false };

describe("buildChecklist", () => {
  it("is all-pending for a freshly seeded wiki", () => {
    const items = buildChecklist(base);
    expect(items.map((i) => i.done)).toEqual([false, false, false]);
    expect(items).toHaveLength(3);
  });

  it("ticks 'write your first page' once a second page exists", () => {
    expect(buildChecklist({ ...base, pages: 2 })[0].done).toBe(true);
  });

  it("ticks 'invite an editor' once a maintainer is configured", () => {
    expect(buildChecklist({ ...base, maintainers: 1 })[1].done).toBe(true);
  });

  it("ticks 'set who can edit' once sign-in is available", () => {
    expect(buildChecklist({ ...base, signinAvailable: true })[2].done).toBe(true);
  });

  it("drops the call-to-action on completed steps (nothing left to do)", () => {
    const done = buildChecklist({ pages: 5, maintainers: 2, signinAvailable: true });
    expect(done[0].action).toBeUndefined();
    expect(done[1].action).toBeUndefined();
    // 'set who can edit' keeps a settings link (protection is always tunable).
    expect(done[2].action).toBeDefined();
  });

  it("keeps the call-to-action on pending steps", () => {
    expect(buildChecklist(base).every((i) => i.action)).toBe(true);
  });
});
