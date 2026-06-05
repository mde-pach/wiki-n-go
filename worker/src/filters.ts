// AbuseFilter: a pre-publish rule pass over an edit. Built-in structural checks
// (size/links/blanking/blocked domains) plus maintainer-authored regex rules.
// Pure and self-contained so it's exhaustively testable; the wrapper in index.ts
// fetches the config and handles tier exemption.

export interface FilterRule {
  id: string;
  pattern: string;
  flags?: string;
  target?: "added" | "content"; // default "content"
  action: "disallow" | "tag";
  message?: string;
  tags?: string[];
}

export interface FilterConfig {
  exemptTier?: string; // editors at/above this tier skip filters (handled by caller)
  blankingRatio?: number; // disallow when an edit removes ≥ this fraction of the page
  maxAddedBytes?: number; // disallow when an edit grows the page by more than this
  maxExternalLinksAdded?: number; // disallow when it adds more than this many links
  blockedDomains?: string[]; // disallow when a newly-added link contains one of these
  rules?: FilterRule[];
}

export interface FilterInputs {
  oldRaw: string;
  newContent: string;
}

export interface FilterVerdict {
  action: "allow" | "disallow";
  message?: string;
  tags: string[];
}

const LINK_RE = /https?:\/\//gi;
const countLinks = (s: string) => (s.match(LINK_RE) ?? []).length;

// Lines present in the new content but not the old — a cheap "added text" view.
function addedText(inp: FilterInputs): string {
  const old = new Set(inp.oldRaw.split("\n"));
  return inp.newContent
    .split("\n")
    .filter((l) => !old.has(l))
    .join("\n");
}

export function evaluateFilters(cfg: FilterConfig, inp: FilterInputs): FilterVerdict {
  const tags = new Set<string>();
  let disallow: string | undefined;
  const block = (msg: string) => {
    if (!disallow) disallow = msg;
  };

  const oldLen = inp.oldRaw.length;
  const newLen = inp.newContent.length;
  const addedLinks = Math.max(0, countLinks(inp.newContent) - countLinks(inp.oldRaw));

  if (
    cfg.blankingRatio != null &&
    oldLen > 0 &&
    newLen < oldLen * (1 - cfg.blankingRatio)
  )
    block("This edit removes most of the page.");
  if (cfg.maxAddedBytes != null && newLen - oldLen > cfg.maxAddedBytes)
    block("This edit adds too much content at once.");
  if (cfg.maxExternalLinksAdded != null && addedLinks > cfg.maxExternalLinksAdded)
    block("This edit adds too many external links.");
  for (const d of cfg.blockedDomains ?? []) {
    if (inp.newContent.includes(d) && !inp.oldRaw.includes(d))
      block("This edit adds a blocked link.");
  }

  for (const r of cfg.rules ?? []) {
    let re: RegExp;
    try {
      re = new RegExp(r.pattern, r.flags ?? "");
    } catch {
      continue; // a malformed rule is ignored, not fatal
    }
    const target = r.target === "added" ? addedText(inp) : inp.newContent;
    if (!re.test(target)) continue;
    if (r.action === "disallow") block(r.message ?? `Blocked by filter “${r.id}”.`);
    else for (const t of r.tags ?? [r.id]) tags.add(t);
  }

  return disallow
    ? { action: "disallow", message: disallow, tags: [...tags] }
    : { action: "allow", tags: [...tags] };
}
