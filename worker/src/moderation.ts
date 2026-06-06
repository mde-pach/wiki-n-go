import { evaluateFilters, type FilterConfig } from "./filters";
import { repoJson } from "./github";
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
