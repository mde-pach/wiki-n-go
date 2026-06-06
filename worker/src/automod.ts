// Automoderator (ClueBot analog): the post-publish safety net for immediate-
// publish. When a freshly auto-merged edit scores high-confidence vandalism on
// the revert-risk heuristic AND its author isn't trusted, the bot reverts it
// through the same reversible rollback path a maintainer uses. The decision is a
// pure function (this file); the orchestration + git ops live in the publish
// path. Guardrails: a trusted-tier exemption and a per-page revert cap so the
// bot can never edit-war.
import { asTier, TIER_RANK, type Tier } from "./trust";
import type { Env } from "./types";

// Auto-revert threshold. Unset/0/invalid → automoderator is OFF (no edit is ever
// auto-reverted) — the responsible default for a bot that acts without review.
// Set it well above RISK_HIGH (50, the human-surfacing line) so the bot only
// touches the most confident cases and humans triage the rest.
export function automodScore(env: Env): number | null {
  const n = Number.parseInt(env.AUTOMOD_REVERT_SCORE ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Authors at/above this tier are never auto-reverted (abuse concentrates in
// open-tier edits). Default `auto` = the autoconfirmed analog.
export function automodExemptTier(env: Env): Tier {
  return asTier(env.AUTOMOD_EXEMPT_TIER, "auto");
}

// Most times the bot will auto-revert one page within the window before backing
// off and leaving it for a human — the anti-edit-war guardrail.
export function automodRevertCap(env: Env): number {
  return Number.parseInt(env.AUTOMOD_REVERT_CAP ?? "", 10) || 3;
}

export interface AutomodInput {
  score: number; // revert-risk 0–100 for the edit
  threshold: number | null; // automodScore(env); null = disabled
  tier: Tier; // the author's trust tier
  exemptTier: Tier; // automodExemptTier(env)
  pageReverts: number; // auto-reverts already made to this page in the window
  cap: number; // automodRevertCap(env)
}

export interface AutomodDecision {
  revert: boolean;
  reason: string; // why it acted (commit/audit detail) or why it held off
}

export function decideAutoRevert(i: AutomodInput): AutomodDecision {
  if (i.threshold === null) return { revert: false, reason: "automoderator disabled" };
  if (TIER_RANK[i.tier] >= TIER_RANK[i.exemptTier])
    return { revert: false, reason: `author is trusted (${i.tier})` };
  if (i.score < i.threshold)
    return { revert: false, reason: `risk ${i.score} below threshold ${i.threshold}` };
  if (i.pageReverts >= i.cap)
    return { revert: false, reason: `per-page revert cap (${i.cap}) reached` };
  return { revert: true, reason: `revert-risk ${i.score} ≥ ${i.threshold}` };
}

// The bot's commit identity — a distinct, non-anonymous actor so its reverts are
// attributable in git history and filterable in the /admin Automoderator view.
export const AUTOMOD_AUTHOR = "automoderator";
export const automodActor = () => ({
  name: AUTOMOD_AUTHOR,
  email: "automod@anon.invalid",
});
