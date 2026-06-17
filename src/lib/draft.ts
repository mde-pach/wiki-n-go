import { isServer } from "solid-js/web";

export interface Draft {
  content: string;
  summary: string;
}

function draftKey(slug: string): string {
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

// Named drafts: a contributor explicitly snapshots work-in-progress for a page
// under a name and resumes it later, without opening a PR. Stored client-side in
// one localStorage list (same no-DB / no-write-path model as the scratch draft
// above), keyed apart from it so an explicit save and the autosave don't clash.
export interface NamedDraft {
  id: string;
  name: string;
  slug: string;
  content: string;
  summary: string;
  savedAt: string; // ISO; sorts chronologically as a plain string
}

const DRAFTS_KEY = "wng-drafts";

// --- pure list operations (no storage, so they unit-test without a DOM) ---

// Insert or replace by id, newest first. A resumed draft keeps its id, so saving
// it again updates in place rather than piling up copies.
export function upsertDraft(drafts: NamedDraft[], draft: NamedDraft): NamedDraft[] {
  return [draft, ...drafts.filter((d) => d.id !== draft.id)];
}

export function removeNamedDraft(drafts: NamedDraft[], id: string): NamedDraft[] {
  return drafts.filter((d) => d.id !== id);
}

export function sortedDrafts(drafts: NamedDraft[]): NamedDraft[] {
  return [...drafts].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function draftsForSlug(drafts: NamedDraft[], slug: string): NamedDraft[] {
  return sortedDrafts(drafts.filter((d) => d.slug === slug));
}

function isNamedDraft(d: unknown): d is NamedDraft {
  return (
    typeof d === "object" &&
    d !== null &&
    typeof (d as NamedDraft).id === "string" &&
    typeof (d as NamedDraft).slug === "string" &&
    typeof (d as NamedDraft).content === "string"
  );
}

// --- localStorage wrappers (client-only) ---

export function loadDrafts(): NamedDraft[] {
  if (isServer) return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter(isNamedDraft) : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: NamedDraft[]): void {
  if (!isServer) localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function saveNamedDraft(input: {
  id?: string;
  name: string;
  slug: string;
  content: string;
  summary: string;
}): NamedDraft {
  const draft: NamedDraft = {
    id: input.id || crypto.randomUUID(),
    name: input.name,
    slug: input.slug,
    content: input.content,
    summary: input.summary,
    savedAt: new Date().toISOString(),
  };
  writeDrafts(upsertDraft(loadDrafts(), draft));
  return draft;
}

export function deleteNamedDraft(id: string): void {
  writeDrafts(removeNamedDraft(loadDrafts(), id));
}

export function getNamedDraft(id: string): NamedDraft | undefined {
  return loadDrafts().find((d) => d.id === id);
}
