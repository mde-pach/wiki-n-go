import { isServer } from "solid-js/web";

export interface Draft {
  content: string;
  summary: string;
}

export function draftKey(slug: string): string {
  return `wng-draft:${slug}`;
}

// Returns a stored draft only when it diverges from the current document, so a
// reload that hasn't changed anything doesn't surface a "restored" banner.
export function loadDraft(slug: string, current: string): Draft | undefined {
  const saved = localStorage.getItem(draftKey(slug));
  if (!saved) return undefined;
  try {
    const d = JSON.parse(saved) as { content?: string; summary?: string };
    if (!d.content || d.content === current) return undefined;
    return { content: d.content, summary: d.summary ?? "" };
  } catch {
    localStorage.removeItem(draftKey(slug));
    return undefined;
  }
}

// Persist the in-progress edit, or clear it once it matches the saved document
// with no pending summary.
export function persistDraft(
  slug: string,
  content: string,
  summary: string,
  original: string,
): void {
  if (isServer) return;
  if (content === original && !summary.trim()) localStorage.removeItem(draftKey(slug));
  else localStorage.setItem(draftKey(slug), JSON.stringify({ content, summary }));
}

export function clearDraft(slug: string): void {
  localStorage.removeItem(draftKey(slug));
}
