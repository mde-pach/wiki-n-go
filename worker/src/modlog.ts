import { appendJsonl, getCurrentFile } from "./repo";
import type { Env } from "./types";

// Durable record of *human* moderation decisions that aren't otherwise in git:
// a maintainer patrolling a revision, or applying a maintenance tag. These map to
// `patrol:<sha>` / `tag:<sha>` KV keys, which are otherwise ephemeral — fine on
// Cloudflare (KV persists) but lost on a Bun restart (in-memory store, M11). So
// they're also appended here, one JSON line per action at the repo root, and
// replayed into the store on boot (`hydrateModLog`). Append-only + low-frequency
// (human actions, like the audit log), so a commit per entry is fine.
//
// NOT logged: autopatrol (runs on every publish — keeping it off git avoids
// doubling the commit rate; it's tier-derived and fails open, so a restart at
// worst re-shows a trusted edit as unpatrolled until re-checked). Only explicit
// human decisions need durability.

export const MOD_LOG_PATH = ".wikigit/moderation.jsonl";

export type ModEntry =
  | { type: "patrol"; sha: string }
  | { type: "tag"; sha: string; tags: string[] };

// Pure: parse the log text into entries, skipping blank/garbage lines.
export function parseModLog(raw: string | undefined): ModEntry[] {
  if (!raw) return [];
  const out: ModEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as ModEntry;
      if ((e.type === "patrol" || e.type === "tag") && typeof e.sha === "string") {
        out.push(e);
      }
    } catch {}
  }
  return out;
}

// Pure: fold entries into the KV key/value pairs to seed the store. Later `tag`
// entries for a sha supersede earlier ones (the handler writes the full set).
export function replayModLog(entries: ModEntry[]): Map<string, string> {
  const kv = new Map<string, string>();
  for (const e of entries) {
    if (e.type === "patrol") kv.set(`patrol:${e.sha}`, "1");
    else kv.set(`tag:${e.sha}`, JSON.stringify(e.tags));
  }
  return kv;
}

// Append one entry to the git log (mirrors appendAudit). `by` authors the commit.
export async function appendModLog(
  env: Env,
  entry: ModEntry,
  by: { name: string; email: string },
): Promise<void> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  await appendJsonl(
    env,
    repo,
    MOD_LOG_PATH,
    entry,
    `mod: ${entry.type} ${entry.sha.slice(0, 7)}`,
    by,
  );
}

// Boot-time hydration for the Bun runtime: read the git log and seed the
// in-memory store so manual patrols/tags survive a restart. No-op (best-effort)
// if the file or store is absent — the system fails open.
export async function hydrateModLog(env: Env): Promise<number> {
  const kv = env.RATE_LIMIT;
  if (!kv) return 0;
  const current = await getCurrentFile(
    env,
    `${env.REPO_OWNER}/${env.REPO_NAME}`,
    MOD_LOG_PATH,
  );
  const pairs = replayModLog(parseModLog(current?.raw));
  for (const [k, v] of pairs) await kv.put(k, v);
  return pairs.size;
}
