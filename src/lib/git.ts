import { execFileSync } from "node:child_process";
import { config } from "../config";
import type { Contribution } from "./contributions";
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

// Build-time per-author contributions over the content tree, emitted as the
// static `/contributions.json` the profile panel falls back to when there's no
// Worker. `created` is left empty here (numstat carries no add/modify status) —
// the live Worker endpoint fills it in.
export function gitContributions(): Record<string, Contribution[]> {
  const dir = config.contentDir;
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        "--max-count=1000",
        "--format=__C__%x1f%H%x1f%an%x1f%aI%x1f%s",
        "--numstat",
        "--",
        dir,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const byAuthor: Record<string, Contribution[]> = {};
    let cur: (Contribution & { author: string }) | null = null;
    const flush = () => {
      if (cur?.slugs.length) {
        const { author, ...rest } = cur;
        byAuthor[author] ??= [];
        byAuthor[author].push(rest);
      }
      cur = null;
    };
    for (const line of out.split("\n")) {
      if (line.startsWith("__C__")) {
        flush();
        const [, sha, author, date, message] = line.split("\x1f");
        cur = {
          author,
          sha,
          date,
          message,
          slugs: [],
          created: [],
          additions: 0,
          deletions: 0,
        };
      } else if (cur && line.trim()) {
        const [add, del, path] = line.split("\t");
        if (!path?.startsWith(`${dir}/`) || !path.endsWith(".md")) continue;
        cur.additions += Number.parseInt(add, 10) || 0;
        cur.deletions += Number.parseInt(del, 10) || 0;
        cur.slugs.push(path.slice(dir.length + 1, -3));
      }
    }
    flush();
    return byAuthor;
  } catch {
    return {};
  }
}
