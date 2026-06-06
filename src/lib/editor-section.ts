import { slugifyLabel } from "./paths";

export interface SectionSpan {
  start: number;
  end: number;
  heading: string;
}

// Locate the character span of a `##`/`###` section by its slugified heading,
// for deep-linking from a heading's `[edit]`. The span runs from the matched
// heading to the next heading (or end of text). Returns undefined if absent.
export function findSection(body: string, section: string): SectionSpan | undefined {
  const lines = body.split("\n");
  let offset = 0;
  let start = -1;
  let end = body.length;
  let heading = "";
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) {
      if (start === -1 && slugifyLabel(m[1]) === section) {
        start = offset;
        heading = m[1];
      } else if (start !== -1) {
        end = offset;
        break;
      }
    }
    offset += line.length + 1;
  }
  if (start === -1) return undefined;
  return { start, end, heading };
}
