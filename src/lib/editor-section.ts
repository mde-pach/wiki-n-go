import { slugifyLabel } from "./paths";

export interface SectionSpan {
  start: number;
  end: number;
  heading: string;
  slug: string;
}

// Every `##`/`###` section as a character span running from its heading to the
// next heading of any level (or end of text). Drives section deep-links and the
// split-page section picker.
export function listSections(body: string): SectionSpan[] {
  const lines = body.split("\n");
  const heads: { offset: number; heading: string }[] = [];
  let offset = 0;
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) heads.push({ offset, heading: m[1] });
    offset += line.length + 1;
  }
  return heads.map((h, i) => ({
    start: h.offset,
    end: i + 1 < heads.length ? heads[i + 1].offset : body.length,
    heading: h.heading,
    slug: slugifyLabel(h.heading),
  }));
}

// The span of one section by its slugified heading (the first match), for
// deep-linking from a heading's `[edit]`. Returns undefined if absent.
export function findSection(body: string, section: string): SectionSpan | undefined {
  return listSections(body).find((s) => s.slug === section);
}
