import { slugifyLabel } from "./paths";

export interface SectionSpan {
  start: number;
  end: number;
  heading: string;
}

// Locate the character span of a section by its slugified heading, for editing
// it in isolation. The span runs from the matched heading through everything
// beneath it — *including* deeper subsections — up to the next heading of the
// same or higher level (or end of text), so editing a `##` carries its `###`
// children with it. Returns undefined when the heading is absent.
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
  return { start, end, heading };
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
