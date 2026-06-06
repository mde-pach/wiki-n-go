import { describe, expect, it } from "vitest";
import { autopatrol, autopatrolTier } from "./moderation";
import type { Env } from "./types";

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    _map: m,
  };
}

const env = (over: Partial<Env> = {}, kv = fakeKV()) =>
  ({ RATE_LIMIT: kv, ...over }) as unknown as Env;

describe("autopatrolTier", () => {
  it("defaults to extended", () => {
    expect(autopatrolTier(env())).toBe("extended");
  });
  it("honors AUTOPATROL_TIER and falls back on a bad value", () => {
    expect(autopatrolTier(env({ AUTOPATROL_TIER: "maintainer" }))).toBe("maintainer");
    expect(autopatrolTier(env({ AUTOPATROL_TIER: "nonsense" }))).toBe("extended");
  });
});

describe("autopatrol", () => {
  it("patrols an edit at or above the bar", async () => {
    const kv = fakeKV();
    await autopatrol(env({}, kv), "extended", "sha1");
    expect(await kv.get("patrol:sha1")).toBe("1");
    await autopatrol(env({}, kv), "maintainer", "sha2");
    expect(await kv.get("patrol:sha2")).toBe("1");
  });
  it("leaves edits below the bar unpatrolled", async () => {
    const kv = fakeKV();
    await autopatrol(env({}, kv), "open", "sha1");
    await autopatrol(env({}, kv), "auto", "sha2");
    expect(await kv.get("patrol:sha1")).toBeNull();
    expect(await kv.get("patrol:sha2")).toBeNull();
  });
  it("respects a custom bar", async () => {
    const kv = fakeKV();
    const e = env({ AUTOPATROL_TIER: "maintainer" }, kv);
    await autopatrol(e, "extended", "sha1");
    expect(await kv.get("patrol:sha1")).toBeNull();
    await autopatrol(e, "maintainer", "sha2");
    expect(await kv.get("patrol:sha2")).toBe("1");
  });
  it("no-ops without a KV binding", async () => {
    await expect(
      autopatrol({ AUTOPATROL_TIER: "open" } as unknown as Env, "maintainer", "s"),
    ).resolves.toBeUndefined();
  });
});
