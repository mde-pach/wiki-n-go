import { config } from "../config";
import type { Tier } from "./api";
import { fetchFirstOk } from "./net";
import { BASE } from "./paths";

export interface Contribution {
  sha: string;
  date: string;
  message: string;
  slugs: string[];
  created: string[]; // slugs this edit created (live endpoint only; [] in the static fallback)
  additions: number;
  deletions: number;
}

export interface Contributions {
  login: string;
  tier: Tier;
  isAnon: boolean;
  contributions: Contribution[];
}

// Prefer the Worker's live, KV-cached endpoint (covers direct edits + merged PRs,
// and reports the trust tier); fall back to the static build-time map when there's
// no Worker / it's unreachable. The fallback can't derive trust, so it reports
// the base `open` tier.
export async function getContributions(login: string): Promise<Contributions> {
  const live = config.workerUrl
    ? await fetchFirstOk<Contributions>([
        `${config.workerUrl}/contributions?author=${encodeURIComponent(login)}`,
      ])
    : null;
  if (live) return live;

  const all = await fetchFirstOk<Record<string, Contribution[]>>([
    `${BASE}/contributions.json`,
  ]);
  return {
    login,
    tier: "open",
    isAnon: login.startsWith("anon-"),
    contributions: all?.[login] ?? [],
  };
}
