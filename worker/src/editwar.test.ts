import { describe, expect, it } from "vitest";
import { bumpEditWar, threeRrMax } from "./moderation";
import type { Env } from "./types";

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

const env = (over: Partial<Env> = {}, kv = fakeKV()) =>
  ({ RATE_LIMIT: kv, ...over }) as unknown as Env;

describe("threeRrMax", () => {
  it("defaults to 3, honors THREE_RR_MAX", () => {
    expect(threeRrMax(env())).toBe(3);
    expect(threeRrMax(env({ THREE_RR_MAX: "5" }))).toBe(5);
    expect(threeRrMax(env({ THREE_RR_MAX: "junk" }))).toBe(3);
  });
});

describe("bumpEditWar", () => {
  it("flags only once the same author passes the bar on the same page", async () => {
    const e = env();
    const hits = [];
    for (let i = 0; i < 4; i++) hits.push(await bumpEditWar(e, "anon-x", "intro"));
    expect(hits).toEqual([false, false, false, true]);
  });
  it("counts per author+page independently", async () => {
    const e = env();
    await bumpEditWar(e, "anon-x", "a");
    await bumpEditWar(e, "anon-x", "a");
    await bumpEditWar(e, "anon-x", "a");
    expect(await bumpEditWar(e, "anon-x", "b")).toBe(false);
    expect(await bumpEditWar(e, "anon-y", "a")).toBe(false);
  });
  it("no-ops without a KV binding", async () => {
    expect(await bumpEditWar({} as unknown as Env, "anon-x", "a")).toBe(false);
  });
});
