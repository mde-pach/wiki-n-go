import { gh, ghAuth } from "../github";
import { HttpError } from "../http";
import {
  buildNode,
  graphFromMap,
  type IndexMap,
  searchDocsFromMap,
  slugifyTarget,
} from "../indexlib";
import { cached, kvGetJson, kvPutJson } from "../kv";
import { getCurrentFile } from "../repo";
import { frontmatter } from "../trust";
import type { Env } from "../types";

export async function latestSha(env: Env): Promise<{ sha: string }> {
  const sha = await cached(env, "meta:latest-sha", 20_000, async () => {
    const res = await fetch(
      `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/commits/${env.BRANCH}`,
      { headers: { ...ghAuth(env), Accept: "application/vnd.github.sha" } },
    );
    if (!res.ok) throw new HttpError(502, `GitHub ${res.status}`);
    return (await res.text()).trim();
  });
  return { sha };
}

export async function listPages(env: Env): Promise<{ pages: string[] }> {
  const pages = await cached(env, "meta:pages", 60_000, async () => {
    const tree = await gh<{ tree: { path: string; type: string }[] }>(
      env,
      `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/git/trees/${env.BRANCH}?recursive=1`,
    );
    const prefix = `${env.CONTENT_DIR}/`;
    return tree.tree
      .filter(
        (n) => n.type === "blob" && n.path.startsWith(prefix) && n.path.endsWith(".md"),
      )
      .map((n) => n.path.slice(prefix.length, -3));
  });
  return { pages };
}

const INDEX_TTL_MS = 3_600_000; // safety rebuild for drift (PR merges, direct pushes)

// Live link/search index: a per-slug map maintained incrementally on direct
// edits and rebuilt in full only on a cache miss (first call, after a merge, or
// once the TTL lapses). Reports derive from it in memory — no per-request fetch.
function getIndex(env: Env): Promise<IndexMap> {
  return cached(env, "meta:index", INDEX_TTL_MS, () => buildIndex(env));
}

async function buildIndex(env: Env): Promise<IndexMap> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const { pages } = await listPages(env);
  const map: IndexMap = {};
  await Promise.all(
    pages.map(async (slug) => {
      const file = await getCurrentFile(env, repo, `${env.CONTENT_DIR}/${slug}.md`);
      if (file) map[slug] = nodeFromRaw(slug, file.raw);
    }),
  );
  return map;
}

function nodeFromRaw(slug: string, raw: string) {
  const meta = frontmatter(raw);
  const redirect =
    typeof meta.redirect === "string" ? slugifyTarget(meta.redirect) : undefined;
  return buildNode(slug, raw, redirect);
}

// Patch one page's entry after a direct commit — no refetch, the content is in
// hand. If the index isn't built yet, skip; the next read builds it fresh.
export async function updateIndexEntry(
  env: Env,
  slug: string,
  raw: string,
): Promise<void> {
  const hit = await kvGetJson<{ v: IndexMap }>(env, "meta:index");
  if (!hit) return;
  hit.v[slug] = nodeFromRaw(slug, raw);
  await kvPutJson(env, "meta:index", { v: hit.v, ts: Date.now() });
}

// Drop a page's entry after a rollback deletes the file (it was created by the
// reverted commit). Same in-place patch as updateIndexEntry; no refetch.
export async function removeIndexEntry(env: Env, slug: string): Promise<void> {
  const hit = await kvGetJson<{ v: IndexMap }>(env, "meta:index");
  if (!hit) return;
  delete hit.v[slug];
  await kvPutJson(env, "meta:index", { v: hit.v, ts: Date.now() });
}

export function linkGraph(env: Env) {
  return getIndex(env).then((map) => graphFromMap(map, env.HOME_SLUG ?? "index"));
}

export function searchIndex(env: Env) {
  return getIndex(env).then((map) => ({ docs: searchDocsFromMap(map) }));
}
