import { execFileSync } from "node:child_process";
import { config } from "../config";
import type { Revision } from "./history";

// Build/SSR-only: the commit history of a content file straight from local git,
// so the read view can server-render the "last edited" line instead of fetching
// it client-side (no blink). The client still refetches live to stay current.
export function gitRevisions(slug: string): Revision[] {
  const path = `${config.contentDir}/${slug}.md`;
  try {
    const out = execFileSync(
      "git",
      ["log", "--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s", "--", path],
      { encoding: "utf8" },
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, parents, author, date, message] = line.split("\x1f");
        return { sha, parent: parents.split(" ")[0] || null, author, date, message };
      });
  } catch {
    return [];
  }
}
