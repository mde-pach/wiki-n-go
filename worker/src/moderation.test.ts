import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import {
  bumpEditWar,
  enforceRateLimit,
  leadingZeroBits,
  verifyPow,
} from "./moderation";
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

const enc = new TextEncoder();

// Mine a token whose SHA-256 (the same digest the Worker uses) has `bits`
// leading zeros, so the accept path is exercised with a genuine solution.
async function mine(bits: number, ts = Date.now()): Promise<string> {
  for (let n = 0; ; n++) {
    const token = `${ts}.salt.${n.toString(36)}`;
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(token)),
    );
    if (leadingZeroBits(hash) >= bits) return token;
  }
}

const status = async (p: Promise<unknown>): Promise<number | "ok"> => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
};

describe("leadingZeroBits", () => {
  it("counts leading zero bits across bytes", () => {
    expect(leadingZeroBits(new Uint8Array([0xff]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0x7f]))).toBe(1);
    expect(leadingZeroBits(new Uint8Array([0x01]))).toBe(7);
    expect(leadingZeroBits(new Uint8Array([0x00, 0xff]))).toBe(8);
    expect(leadingZeroBits(new Uint8Array([0x00, 0x0f]))).toBe(12);
    expect(leadingZeroBits(new Uint8Array([0x00, 0x00]))).toBe(16);
  });
});

// PoW is fail-closed without a store, so the enabled-path tests bind one.
const powEnv = (bits: string) =>
  ({ POW_BITS: bits, RATE_LIMIT: fakeKV() }) as unknown as Env;

describe("verifyPow", () => {
  it("is a no-op when POW_BITS <= 0", async () => {
    expect(await status(verifyPow({ POW_BITS: "0" } as Env, ""))).toBe("ok");
  });

  it("503s when enabled but no replay store is bound (fail closed)", async () => {
    const token = await mine(8);
    expect(await status(verifyPow({ POW_BITS: "8" } as Env, token))).toBe(503);
  });

  it("400s on a missing token when enabled", async () => {
    expect(await status(verifyPow(powEnv("8"), ""))).toBe(400);
  });

  it("403s on an expired timestamp", async () => {
    const stale = `${Date.now() - 200_000}.salt.0`;
    expect(await status(verifyPow(powEnv("8"), stale))).toBe(403);
  });

  it("403s on a timestamp too far in the future", async () => {
    const future = `${Date.now() + 200_000}.salt.0`;
    expect(await status(verifyPow(powEnv("8"), future))).toBe(403);
  });

  it("403s when the hash has too few leading zero bits", async () => {
    // A token whose hash almost certainly has < 16 leading zeros.
    const token = `${Date.now()}.salt.weak`;
    expect(await status(verifyPow(powEnv("16"), token))).toBe(403);
  });

  it("accepts a correctly mined token", async () => {
    const token = await mine(8);
    expect(await status(verifyPow(powEnv("8"), token))).toBe("ok");
  });

  it("rejects a replay of an already-used token (single-use)", async () => {
    const kv = fakeKV();
    const env = { POW_BITS: "8", RATE_LIMIT: kv } as unknown as Env;
    const token = await mine(8);
    expect(await status(verifyPow(env, token))).toBe("ok"); // first use
    expect(await status(verifyPow(env, token))).toBe(403); // replay blocked
  });
});

describe("enforceRateLimit (fixed window, 5 / window)", () => {
  it("allows the first 5 then 429s the 6th", async () => {
    const env = { RATE_LIMIT: fakeKV() } as unknown as Env;
    for (let i = 0; i < 5; i++) {
      expect(await status(enforceRateLimit(env, "anon-x"))).toBe("ok");
    }
    expect(await status(enforceRateLimit(env, "anon-x"))).toBe(429);
  });

  it("counts per author independently", async () => {
    const env = { RATE_LIMIT: fakeKV() } as unknown as Env;
    for (let i = 0; i < 5; i++) await enforceRateLimit(env, "anon-a");
    expect(await status(enforceRateLimit(env, "anon-b"))).toBe("ok");
  });

  it("no-ops without a bound namespace", async () => {
    expect(await status(enforceRateLimit({} as Env, "anon-x"))).toBe("ok");
  });
});

describe("bumpEditWar (3RR proxy, default max 3)", () => {
  it("flags only the 4th edit to one page", async () => {
    const env = { RATE_LIMIT: fakeKV() } as unknown as Env;
    expect(await bumpEditWar(env, "anon-x", "coffee")).toBe(false); // 1
    expect(await bumpEditWar(env, "anon-x", "coffee")).toBe(false); // 2
    expect(await bumpEditWar(env, "anon-x", "coffee")).toBe(false); // 3
    expect(await bumpEditWar(env, "anon-x", "coffee")).toBe(true); // 4 → edit-war
  });

  it("scopes the counter per author+page", async () => {
    const env = { RATE_LIMIT: fakeKV() } as unknown as Env;
    for (let i = 0; i < 3; i++) await bumpEditWar(env, "anon-x", "coffee");
    expect(await bumpEditWar(env, "anon-x", "tea")).toBe(false); // different page
  });

  it("respects THREE_RR_MAX", async () => {
    const env = { RATE_LIMIT: fakeKV(), THREE_RR_MAX: "1" } as unknown as Env;
    expect(await bumpEditWar(env, "anon-x", "p")).toBe(false); // 1
    expect(await bumpEditWar(env, "anon-x", "p")).toBe(true); // 2 > 1
  });
});
