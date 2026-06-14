import { describe, expect, it } from "vitest";
import { solvePow } from "./pow";

// Mirror of the Worker's leadingZeroBits (worker/src/moderation.ts) so this test
// verifies the client's solution would satisfy the server's check.
function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

describe("solvePow (client) ↔ verifyPow (server) agreement", () => {
  it("returns an empty token when disabled", async () => {
    expect(await solvePow(0)).toBe("");
  });

  it("mines a token the Worker's SHA-256 + difficulty check accepts", async () => {
    const bits = 10;
    const token = await solvePow(bits);
    // Re-hash with Web Crypto — the exact digest the Worker uses (not the
    // vendored sync sha256 the client mined with) — and confirm they agree.
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    expect(leadingZeroBits(hash)).toBeGreaterThanOrEqual(bits);
    expect(token.split(".")).toHaveLength(3); // <ts>.<salt>.<nonce>
  });
});
