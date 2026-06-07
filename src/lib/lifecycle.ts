import { postJson } from "./api";
import { findSection } from "./editor-section";
import { splitFrontmatter, withFrontmatter } from "./frontmatter";
import { prettify } from "./paths";

export interface LifecycleResult {
  ok: true;
  from: string;
  to: string;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  return [];
}

// Compose the merged target: fold `from`'s body under a heading after `to`'s,
// and record the provenance in a `merged_from` frontmatter list (deduped, so a
// repeat merge doesn't pile up). The Worker leaves the redirect at `from`.
export function composeMerge(fromSlug: string, fromRaw: string, toRaw: string): string {
  const to = splitFrontmatter(toRaw);
  const from = splitFrontmatter(fromRaw);
  const merged_from = [...new Set([...asList(to.data.merged_from), fromSlug])];
  const body = `${to.body.trimEnd()}\n\n## ${prettify(fromSlug)}\n\n${from.body.trim()}\n`;
  return withFrontmatter({ ...to.data, merged_from }, body);
}

// Compose both sides of a split: the new page seeded from one section (heading
// promoted to a top-level `#`, with `split_from` provenance) and the source with
// that section trimmed out. Returns null if the section isn't found.
export function composeSplit(
  fromSlug: string,
  fromRaw: string,
  sectionSlug: string,
): { fromContent: string; toContent: string } | null {
  const { data, body } = splitFrontmatter(fromRaw);
  const span = findSection(body, sectionSlug);
  if (!span) return null;
  const section = body
    .slice(span.start, span.end)
    .trim()
    .replace(/^#{2,3}\s+/, "# ");
  const trimmed = `${body.slice(0, span.start)}${body.slice(span.end)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    toContent: withFrontmatter({ split_from: fromSlug }, `${section}\n`),
    fromContent: withFrontmatter(data, `${trimmed}\n`),
  };
}

export function mergePages(
  from: string,
  to: string,
  content: string,
  summary: string,
  token?: string,
): Promise<LifecycleResult> {
  return postJson<LifecycleResult>("/merge", { from, to, content, summary, token });
}

export function splitPage(
  from: string,
  to: string,
  fromContent: string,
  toContent: string,
  summary: string,
  token?: string,
): Promise<LifecycleResult> {
  return postJson<LifecycleResult>("/split", {
    from,
    to,
    fromContent,
    toContent,
    summary,
    token,
  });
}
