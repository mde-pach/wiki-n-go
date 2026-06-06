import { parse, stringify } from "yaml";

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
  // One-line summary → <meta description>, hover-preview text, search snippet.
  description?: string;
  // Points this page at another: the reader bounces to the target (#REDIRECT).
  redirect?: string;
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

// Split a page into its raw frontmatter object (all keys, including ones we
// don't model) and its body — the basis for editing properties via a form
// while preserving everything else on round-trip.
export function splitFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { data: {}, body: raw };
  try {
    const parsed = parse(m[1]);
    const data =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    return { data, body: raw.slice(m[0].length) };
  } catch {
    return { data: {}, body: raw.slice(m[0].length) };
  }
}

// Reassemble a markdown doc from a frontmatter object + body. An empty object
// yields no frontmatter block (so plain pages stay plain).
export function withFrontmatter(data: Record<string, unknown>, body: string): string {
  if (Object.keys(data).length === 0) return body;
  return `---\n${stringify(data)}---\n\n${body.replace(/^\s+/, "")}`;
}
