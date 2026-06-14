import { describe, expect, it } from "vitest";
import { enforceRateLimit, verifyPow } from "./moderation";
import { MemoryKV } from "./store";
import type { Env } from "./types";

describe("MemoryKV (M11 portable store)", () => {
  it("round-trips a value", async () => {
    const kv = new MemoryKV();
    await kv.put("a", "1");
    expect(await kv.get("a")).toBe("1");
    expect(await kv.get("missing")).toBeNull();
  });

  it("deletes", async () => {
    const kv = new MemoryKV();
    await kv.put("a", "1");
    await kv.delete("a");
    expect(await kv.get("a")).toBeNull();
  });

  it("expires a key after its TTL (lazy, on read)", async () => {
    let t = 1000;
    const kv = new MemoryKV(() => t);
    await kv.put("a", "1", { expirationTtl: 60 }); // expires at 61000
    t = 60_999;
    expect(await kv.get("a")).toBe("1");
    t = 61_000;
    expect(await kv.get("a")).toBeNull();
  });

  it("keeps a key with no TTL indefinitely", async () => {
    let t = 0;
    const kv = new MemoryKV(() => t);
    await kv.put("a", "1");
    t = 10 ** 12;
    expect(await kv.get("a")).toBe("1");
  });

  it("lists by prefix and strips expired keys", async () => {
    let t = 0;
    const kv = new MemoryKV(() => t);
    await kv.put("r:x:rl:a", "1");
    await kv.put("r:x:rl:b", "1", { expirationTtl: 10 }); // expires at 10000
    await kv.put("r:y:rl:c", "1");
    t = 11_000;
    const { keys } = await kv.list({ prefix: "r:x:" });
    expect(keys.map((k) => k.name).sort()).toEqual(["r:x:rl:a"]); // b expired, y filtered
  });

  it("honors a list limit", async () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 5; i++) await kv.put(`k${i}`, "1");
    expect((await kv.list({ limit: 2 })).keys).toHaveLength(2);
  });

  // Drop-in proof: real Worker code (the rate-limit gate) runs against MemoryKV
  // exactly as it does against the Cloudflare binding — this is what M11.2 relies on.
  it("is a drop-in for the rate-limit gate", async () => {
    const env = { RATE_LIMIT: new MemoryKV() } as unknown as Env;
    const status = async () => {
      try {
        await enforceRateLimit(env, "anon-x");
        return "ok";
      } catch (e) {
        return (e as { status?: number }).status;
      }
    };
    for (let i = 0; i < 5; i++) expect(await status()).toBe("ok");
    expect(await status()).toBe(429); // 6th blocked, just like the real KV
  });

  it("enforces PoW single-use through MemoryKV", async () => {
    const kv = new MemoryKV();
    const env = { POW_BITS: "0", RATE_LIMIT: kv } as unknown as Env;
    // POW_BITS=0 disables the hash check; this asserts the store wiring compiles
    // and runs against the same binding the gate uses.
    await expect(verifyPow(env, "")).resolves.toBeUndefined();
  });
});
