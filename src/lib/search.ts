import { config } from "../config";
import { BASE } from "./paths";

export interface SearchDoc {
  slug: string;
  title: string;
  text: string;
}

// Prefer the Worker's live index; fall back to the static build file.
export async function getSearchDocs(): Promise<SearchDoc[]> {
  for (const url of [
    config.workerUrl ? `${config.workerUrl}/search-index` : null,
    `${BASE}/search-index.json`,
  ]) {
    if (!url) continue;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return ((await res.json()) as { docs: SearchDoc[] }).docs;
    } catch {
      // try the next source
    }
  }
  return [];
}

export interface SearchHit {
  slug: string;
  title: string;
  snippet: string;
}

// Markdown → searchable plain text. Build-time only (feeds the static index).
export function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]:?/g, " ")
    .replace(/^\s{0,3}[>#\-*+]\s+/gm, " ")
    .replace(/[*_~>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rank docs against a query: every term must appear (AND); title matches and
// exact/prefix title hits are boosted over body matches.
export function search(docs: SearchDoc[], query: string, limit = 7): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);

  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const text = doc.text.toLowerCase();
    let score = 0;
    let missing = false;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inText = text.includes(t);
      if (!inTitle && !inText) {
        missing = true;
        break;
      }
      score += inTitle ? 10 : 3;
    }
    if (missing) continue;
    if (title.startsWith(q)) score += 8;
    if (title === q) score += 20;
    scored.push({ doc, score });
  }

  scored.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
  return scored.slice(0, limit).map(({ doc }) => ({
    slug: doc.slug,
    title: doc.title,
    snippet: snippet(doc.text, terms[0]),
  }));
}

function snippet(text: string, term: string, radius = 64): string {
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + term.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// Split text into runs, flagging which ones match a query term, so the UI can
// wrap matches in <mark> without dangerouslySetInnerHTML.
export function splitHighlight(
  text: string,
  query: string,
): { t: string; hit: boolean }[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [{ t: text, hit: false }];
  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ t: p, hit: terms.includes(p.toLowerCase()) }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slugifyQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/^-+|-+$/g, "");
}
