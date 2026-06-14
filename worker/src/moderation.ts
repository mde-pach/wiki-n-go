import { HttpError } from "./http";
import { asTier, TIER_RANK, type Tier } from "./trust";
import type { Env } from "./types";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 600;

// Autopatrol: an edit by a trusted-enough author counts as reviewed on landing,
// so the patrol queue (and noindex-until-patrolled) only flags edits that need
// eyes. Default bar is `extended`; set AUTOPATROL_TIER to tune it.
export function autopatrolTier(env: Env): Tier {
  return asTier(env.AUTOPATROL_TIER, "extended");
}

export async function autopatrol(env: Env, tier: Tier, sha: string): Promise<void> {
  if (env.RATE_LIMIT && TIER_RANK[tier] >= TIER_RANK[autopatrolTier(env)])
    await env.RATE_LIMIT.put(`patrol:${sha}`, "1");
}

const EDIT_WAR_WINDOW_S = 86_400;

export function threeRrMax(env: Env): number {
  return Number.parseInt(env.THREE_RR_MAX ?? "", 10) || 3;
}

// 3RR proxy: count an author's edits to one page over 24h; once it passes the
// bar (the 4th edit) the edit is flagged `edit-war` for review. A tag, not a
// block — legit rapid edits happen; the score + patrol queue handle the rest.
export async function bumpEditWar(
  env: Env,
  author: string,
  slug: string,
): Promise<boolean> {
  if (!env.RATE_LIMIT) return false;
  const key = `ew:${author}:${slug}`;
  const count = Number.parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10) + 1;
  await env.RATE_LIMIT.put(key, String(count), { expirationTtl: EDIT_WAR_WINDOW_S });
  return count > threeRrMax(env);
}

// Self-hosted proof-of-work bot check (replaces Cloudflare Turnstile — no
// third-party service or keys). The browser mints a `<ts>.<salt>.<nonce>` token
// whose SHA-256 has POW_BITS leading zero bits; that search costs real CPU, so
// bulk automated edits get expensive while a single human edit is ~half a
// second. We only re-hash once to verify. `POW_BITS=0` disables the check.
const POW_WINDOW_MS = 120_000;
const POW_SKEW_MS = 60_000;

export function powBits(env: Env): number {
  const n = Number.parseInt(env.POW_BITS ?? "", 10);
  return Number.isFinite(n) ? n : 18;
}

export function leadingZeroBits(hash: Uint8Array): number {
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

export async function verifyPow(env: Env, token: string): Promise<void> {
  const bits = powBits(env);
  if (bits <= 0) return;
  if (!token) throw new HttpError(400, "Missing proof-of-work.");
  const [tsStr, salt] = token.split(".");
  const ts = Number.parseInt(tsStr ?? "", 10);
  const now = Date.now();
  if (
    !salt ||
    !Number.isFinite(ts) ||
    ts > now + POW_SKEW_MS ||
    now - ts > POW_WINDOW_MS
  )
    throw new HttpError(403, "Proof-of-work expired — please try again.");

  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  if (leadingZeroBits(hash) < bits)
    throw new HttpError(403, "Proof-of-work check failed.");

  // Single-use within its freshness window, so a solved token can't be replayed
  // across many submits. KV is eventually consistent — coarse, like the rate
  // limit — and simply unavailable (no replay guard) until a namespace is bound.
  if (env.RATE_LIMIT) {
    const key = `pow:${tsStr}.${salt}`;
    if (await env.RATE_LIMIT.get(key))
      throw new HttpError(403, "Proof-of-work already used — please try again.");
    await env.RATE_LIMIT.put(key, "1", {
      expirationTtl: Math.ceil(POW_WINDOW_MS / 1000),
    });
  }
}

// Fixed-window per-source limit. KV is eventually consistent, so this is coarse
// abuse control, not a precise quota — sufficient alongside PR review.
export async function enforceRateLimit(env: Env, author: string): Promise<void> {
  if (!env.RATE_LIMIT) return;
  const key = `rl:${author}`;
  const count = Number.parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10);
  if (count >= RATE_LIMIT_MAX)
    throw new HttpError(429, "Too many edits — try again later.");
  await env.RATE_LIMIT.put(key, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_S,
  });
}
