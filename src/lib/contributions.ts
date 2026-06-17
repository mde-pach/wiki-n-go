import { config } from "../config";
import type { Tier } from "./api";
import { engineUrl } from "./engine";
import { fetchFirstOk } from "./net";
import { BASE, isAnonName } from "./paths";
import { bootTenant } from "./tenant";

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
  hasMore: boolean;
}

// Prefer the Worker's live, KV-cached endpoint (covers direct edits + merged PRs,
// and reports the trust tier); fall back to the static build-time map when there's
// no Worker / it's unreachable. The fallback can't derive trust, so it reports
// the base `open` tier — and ships the whole list at once, so it never has more.
export async function getContributions(
  login: string,
  page = 1,
): Promise<Contributions> {
  await bootTenant();
  const live = config.workerUrl
    ? await fetchFirstOk<Contributions>([
        engineUrl(`/contributions?author=${encodeURIComponent(login)}&page=${page}`),
      ])
    : null;
  if (live) return live;

  const all = await fetchFirstOk<Record<string, Contribution[]>>([
    `${BASE}/contributions.json`,
  ]);
  return {
    login,
    tier: "open",
    isAnon: isAnonName(login),
    contributions: page === 1 ? (all?.[login] ?? []) : [],
    hasMore: false,
  };
}
