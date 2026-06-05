import { parse } from "yaml";

export interface InfoboxRow {
  v: string;
  mono?: boolean;
  link?: string;
}

export interface PageMeta {
  kicker?: string;
  image?: string;
  infobox?: Record<string, string | InfoboxRow>;
  tags?: string[];
  hatnote?: string;
  banner?: { kind?: "info" | "warn"; text: string };
  // Privileged property: minimum trust tier to edit this page (Worker-enforced).
  protection?: "open" | "auto" | "extended" | "maintainer";
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Split a leading `---` YAML block off the markdown. Pages without one are
// returned unchanged with empty meta, so plain content keeps working.
export function parseFrontmatter(raw: string): { meta: PageMeta; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { meta: {}, body: raw };
  try {
    const data = parse(m[1]);
    const meta = data && typeof data === "object" ? (data as PageMeta) : {};
    return { meta, body: raw.slice(m[0].length) };
  } catch {
    return { meta: {}, body: raw.slice(m[0].length) };
  }
}

export function normalizeRow(value: string | InfoboxRow): InfoboxRow {
  return typeof value === "string" ? { v: value } : value;
}
