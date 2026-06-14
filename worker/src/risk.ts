// Revert-risk heuristic: a cheap 0–100 score from data already on each change
// (byte deltas, anon, page-creation, tags), no extra fetch. Mirrors the signals
// vandalism concentrates in — blanking, large removals, untrusted authors,
// edit-warring. A real ML model (Lift Wing) could replace this later.
export interface RiskInput {
  additions: number;
  deletions: number;
  isAnon: boolean;
  created: boolean;
  tags: string[];
}

export const RISK_HIGH = 50;

// Tags that actually signal revert risk. `edit-war` is scored separately below.
// Manual maintenance tags (cleanup, stub, …) applied via /tag must NOT bump risk,
// so we match an explicit set rather than "any tag that isn't edit-war".
const RISK_TAGS = new Set(["auto-reverted", "blanking", "spam", "vandalism"]);

export function revertRisk(i: RiskInput): number {
  const total = i.additions + i.deletions;
  const removalRatio = total > 0 ? i.deletions / total : 0;
  const net = i.additions - i.deletions;
  let score = 0;

  if (i.isAnon) score += 15;
  if (removalRatio >= 0.8 && i.deletions >= 20) score += 35;
  else if (removalRatio >= 0.5 && i.deletions >= 50) score += 20;
  if (net <= -200) score += 20;
  if (i.created && i.additions < 20) score += 15;
  if (i.tags.includes("edit-war")) score += 25;
  if (i.tags.some((t) => RISK_TAGS.has(t))) score += 20;

  return Math.min(score, 100);
}
