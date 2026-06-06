import { describe, expect, it } from "vitest";
import { RISK_HIGH, revertRisk } from "./risk";

const base = {
  additions: 0,
  deletions: 0,
  isAnon: false,
  created: false,
  tags: [] as string[],
};

describe("revertRisk", () => {
  it("scores a benign signed-in edit low", () => {
    expect(revertRisk({ ...base, additions: 40, deletions: 5 })).toBeLessThan(
      RISK_HIGH,
    );
  });
  it("flags anonymous blanking as high risk", () => {
    const score = revertRisk({ ...base, additions: 0, deletions: 300, isAnon: true });
    expect(score).toBeGreaterThanOrEqual(RISK_HIGH);
  });
  it("treats edit-war + a filter tag as compounding", () => {
    const score = revertRisk({
      ...base,
      additions: 5,
      deletions: 5,
      tags: ["edit-war", "added-links"],
    });
    expect(score).toBe(45); // edit-war 25 + filter tag 20
  });
  it("caps at 100", () => {
    const score = revertRisk({
      additions: 0,
      deletions: 1000,
      isAnon: true,
      created: true,
      tags: ["edit-war", "blocked-domain"],
    });
    expect(score).toBe(100);
  });
  it("flags a thin new page from an anon", () => {
    expect(
      revertRisk({ ...base, additions: 3, deletions: 0, isAnon: true, created: true }),
    ).toBe(15 + 15);
  });
});
