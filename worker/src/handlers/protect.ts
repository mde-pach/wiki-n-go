import { appendAudit } from "../audit";
import { gh } from "../github";
import { HttpError } from "../http";
import { requireMaintainer } from "../identity";
import { invalidateContent } from "../kv";
import { autopatrol } from "../moderation";
import { setProtectionField } from "../protection";
import { commitPayload, getCurrentFile } from "../repo";
import { TIER_RANK } from "../trust";
import { type Env, type ProtectBody, SLUG_RE } from "../types";
import { updateIndexEntry } from "./index-cache";

// Set a page's `protection:` frontmatter tier from the console. Maintainer-only,
// direct commit. `tier: "default"` clears it (page reverts to the env default).
export async function protect(
  env: Env,
  request: Request,
  body: ProtectBody,
): Promise<{ ok: true; tier: string }> {
  const slug = String(body.slug ?? "");
  const tier = String(body.tier ?? "");
  if (!SLUG_RE.test(slug) || slug.includes(".."))
    throw new HttpError(400, "Invalid slug.");
  if (tier !== "default" && !(tier in TIER_RANK))
    throw new HttpError(400, "Invalid protection tier.");

  const writer = await requireMaintainer(env, request, "Protecting");
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const path = `${env.CONTENT_DIR}/${slug}.md`;
  const current = await getCurrentFile(env, repo, path);
  if (!current) throw new HttpError(404, "No such page.");

  const next = setProtectionField(current.raw, tier === "default" ? null : tier);
  if (next === current.raw) return { ok: true, tier };

  const res = await gh<{ commit: { sha: string } }>(
    env,
    `/repos/${repo}/contents/${path}`,
    {
      method: "PUT",
      body: commitPayload(env, {
        message: `Set protection of ${slug} to ${tier}`,
        content: next,
        branch: env.BRANCH,
        sha: current.sha,
        author: { name: writer.name, email: writer.email },
      }),
    },
  );
  await invalidateContent(env, writer.key, { keepIndex: true });
  await updateIndexEntry(env, slug, next);
  await autopatrol(env, "maintainer", res.commit.sha);
  await appendAudit(env, repo, writer.name, writer.email, "protect", slug, tier);
  return { ok: true, tier };
}
