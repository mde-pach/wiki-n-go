import { describe, expect, it } from "vitest";
import {
  type AutomodInput,
  automodExemptTier,
  automodRevertCap,
  automodScore,
  decideAutoRevert,
} from "./automod";
import type { Env } from "./types";

const base: AutomodInput = {
  score: 85,
  threshold: 80,
  tier: "open",
  exemptTier: "auto",
  pageReverts: 0,
  cap: 3,
};

describe("decideAutoRevert", () => {
  it("reverts high-confidence vandalism from an untrusted author", () => {
    const d = decideAutoRevert(base);
    expect(d.revert).toBe(true);
    expect(d.reason).toContain("≥");
  });

  it("is off when no threshold is configured", () => {
    expect(decideAutoRevert({ ...base, threshold: null }).revert).toBe(false);
  });

  it("exempts trusted tiers regardless of score", () => {
    expect(decideAutoRevert({ ...base, tier: "auto", score: 100 }).revert).toBe(false);
    expect(decideAutoRevert({ ...base, tier: "extended" }).revert).toBe(false);
    expect(decideAutoRevert({ ...base, tier: "maintainer" }).revert).toBe(false);
  });

  it("holds off below the threshold", () => {
    const d = decideAutoRevert({ ...base, score: 79 });
    expect(d.revert).toBe(false);
    expect(d.reason).toContain("below threshold");
  });

  it("acts exactly at the threshold", () => {
    expect(decideAutoRevert({ ...base, score: 80 }).revert).toBe(true);
  });

  it("backs off once the per-page revert cap is reached (no edit-war)", () => {
    expect(decideAutoRevert({ ...base, pageReverts: 3, cap: 3 }).revert).toBe(false);
    expect(decideAutoRevert({ ...base, pageReverts: 2, cap: 3 }).revert).toBe(true);
  });
});

const env = (over: Partial<Env>) => over as Env;

describe("config readers", () => {
  it("treats unset/zero/garbage AUTOMOD_REVERT_SCORE as disabled", () => {
    expect(automodScore(env({}))).toBeNull();
    expect(automodScore(env({ AUTOMOD_REVERT_SCORE: "0" }))).toBeNull();
    expect(automodScore(env({ AUTOMOD_REVERT_SCORE: "nope" }))).toBeNull();
    expect(automodScore(env({ AUTOMOD_REVERT_SCORE: "80" }))).toBe(80);
  });

  it("defaults the exempt tier to auto and the cap to 3", () => {
    expect(automodExemptTier(env({}))).toBe("auto");
    expect(automodExemptTier(env({ AUTOMOD_EXEMPT_TIER: "extended" }))).toBe(
      "extended",
    );
    expect(automodRevertCap(env({}))).toBe(3);
    expect(automodRevertCap(env({ AUTOMOD_REVERT_CAP: "5" }))).toBe(5);
  });
});
