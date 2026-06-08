import { config } from "../config";
import { sha256 } from "./sha256";

const enc = new TextEncoder();

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

function randomSalt(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// Solve the proof-of-work bot check: find a nonce so SHA-256 of the token has
// `bits` leading zero bits. The search costs real CPU (the whole point — it
// taxes bulk automated edits); the Worker re-hashes once to verify it (see
// worker/src/moderation.ts `verifyPow`). Runs in chunks of ~30ms of hashing and
// yields to the event loop between them, so the click that triggered it doesn't
// freeze the page. Returns the `<ts>.<salt>.<nonce>` token, or "" when off.
const CHUNK = 16384;

export async function solvePow(bits = config.powBits): Promise<string> {
  if (bits <= 0) return "";
  const prefix = `${Date.now()}.${randomSalt()}.`;
  let nonce = 0;
  for (;;) {
    const stop = nonce + CHUNK;
    for (; nonce < stop; nonce++) {
      const token = prefix + nonce.toString(36);
      if (leadingZeroBits(sha256(enc.encode(token))) >= bits) return token;
    }
    await new Promise((resolve) => setTimeout(resolve));
  }
}
