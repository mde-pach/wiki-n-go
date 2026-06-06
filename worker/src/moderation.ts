import { evaluateFilters, type FilterConfig } from "./filters";
import { repoJson } from "./github";
import { HttpError } from "./http";
import { asTier, TIER_RANK, type Tier } from "./trust";
import type { Env } from "./types";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 600;

export async function verifyTurnstile(
  env: Env,
  ip: string,
  token: string,
): Promise<void> {
  if (!env.TURNSTILE_SECRET) return;
  if (!token) throw new HttpError(400, "Missing challenge token.");
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new HttpError(403, "Bot check failed.");
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

// Ban list lives at the repo root, outside the anon-writable content/ dir.
export async function isBanned(env: Env, author: string): Promise<boolean> {
  const list = await repoJson<unknown>(env, "bans.json");
  return Array.isArray(list) && list.includes(author);
}

// Pre-publish abuse filter. Trusted tiers are exempt (abuse concentrates in
// open-tier edits); everyone else's edit is scored against filters.json.
export async function runFilters(
  env: Env,
  tier: Tier,
  oldRaw: string,
  newContent: string,
) {
  const cfg = await repoJson<FilterConfig>(env, "filters.json");
  if (!cfg) return { action: "allow" as const, tags: [] as string[] };
  if (
    cfg.exemptTier &&
    TIER_RANK[tier] >= TIER_RANK[asTier(cfg.exemptTier, "maintainer")]
  )
    return { action: "allow" as const, tags: [] as string[] };
  return evaluateFilters(cfg, { oldRaw, newContent });
}
