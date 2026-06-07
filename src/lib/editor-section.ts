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

// The span of one section by its slugified heading, for editing it in isolation
// (a heading's `[edit]`). Unlike listSections' shallow spans, this runs from the
// matched heading through everything beneath it — *including* deeper subsections
// — up to the next heading of the same or higher level (or end of text), so
// editing a `##` carries its `###` children with it. Returns undefined when the
// heading is absent.
export function findSection(body: string, section: string): SectionSpan | undefined {
  const lines = body.split("\n");
  let offset = 0;
  let start = -1;
  let level = 0;
  let end = body.length;
  let heading = "";
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      const lvl = m[1].length;
      if (start === -1) {
        if (slugifyLabel(m[2]) === section) {
          start = offset;
          level = lvl;
          heading = m[2];
        }
      } else if (lvl <= level) {
        end = offset;
        break;
      }
    }
    offset += line.length + 1;
  }
  if (start === -1) return undefined;
  return { start, end, heading, slug: section };
}

// Splice an edited slice back into the text the span indexes into: everything
// before the section, then the new section, then everything after. The inverse
// of slicing `source[span.start..span.end]`, so a focused section edit can
// reconstruct the whole document for the normal edit pipeline.
export function spliceSection(
  source: string,
  span: SectionSpan,
  replacement: string,
): string {
  return source.slice(0, span.start) + replacement + source.slice(span.end);
}
