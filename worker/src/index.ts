import { authCallback, authLogin, oauthConfigured } from "./auth";
import { auditLog, ban, listBans, unban } from "./handlers/bans";
import { cite } from "./handlers/cite";
import { createTopic, getThread, listTopics, postComment } from "./handlers/comments";
import {
  diff,
  history,
  listChanges,
  listPending,
  movePage,
  pendingDiff,
  prepareEdit,
  runPublish,
} from "./handlers/content";
import { contributions } from "./handlers/contributions";
import { latestSha, linkGraph, listPages, searchIndex } from "./handlers/index-cache";
import { mergePages, splitPage } from "./handlers/lifecycle";
import {
  deletePage,
  patrol,
  patrolStatus,
  restore,
  review,
  rollback,
} from "./handlers/moderation";
import { protect } from "./handlers/protect";
import { grant, listEditors, revoke } from "./handlers/rights";
import { listSuppressed, suppress, unsuppress } from "./handlers/suppress";
import { corsHeaders, HttpError, json, message, ndjsonStream } from "./http";
import { whoami } from "./identity";
import { resolveTenant } from "./tenant";
import type {
  BanBody,
  CommentBody,
  DeleteBody,
  EditBody,
  Env,
  GrantBody,
  MergeBody,
  MoveBody,
  PatrolBody,
  ProtectBody,
  RestoreBody,
  ReviewBody,
  RollbackBody,
  SplitBody,
  SuppressBody,
  TopicBody,
  UnbanBody,
} from "./types";

export { signSession, verifySession } from "./auth";
export { ipHash } from "./crypto";
export { authorOf, pickCategory } from "./handlers/comments";
export { frontmatter, lastPage, pageTier } from "./trust";
export { SLUG_RE } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    // Scope env to the request's target repo (no-op single-tenant). A bad/unknown
    // repo is rejected here with a clean status before any route runs.
    try {
      env = await resolveTenant(env, request);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }

    const url = new URL(request.url);
    const q = url.searchParams;
    const routes: Record<string, () => Promise<unknown>> = {
      "GET /latest": () => latestSha(env),
      "GET /pages": () => listPages(env),
      "GET /link-graph": () => linkGraph(env),
      "GET /search-index": () => searchIndex(env),
      "GET /cite": () => cite(env, q.get("q") ?? ""),
      "GET /history": () => history(env, q.get("slug") ?? ""),
      "GET /diff": () =>
        diff(env, q.get("slug") ?? "", q.get("base") ?? "", q.get("head") ?? ""),
      "GET /topics": () => listTopics(env, q.get("slug") ?? ""),
      "GET /topic": () => getThread(env, q.get("id") ?? ""),
      "GET /whoami": () => whoami(env, request),
      "GET /changes": () => listChanges(env, q.get("limit") ?? ""),
      "GET /contributions": () => contributions(env, q.get("author") ?? ""),
      "GET /pending": () => listPending(env),
      "GET /pending-diff": () => pendingDiff(env, q.get("number") ?? ""),
      "GET /bans": () => listBans(env),
      "GET /audit": () => auditLog(env, request, q.get("limit") ?? ""),
      "GET /patrol-status": () => patrolStatus(env, q.get("slug") ?? ""),
      "GET /editors": () => listEditors(env, request),
      "GET /suppressed": () => listSuppressed(env, request),
      "GET /auth/status": () => Promise.resolve({ enabled: oauthConfigured(env) }),
      "GET /auth/login": () => authLogin(env, url),
      "GET /auth/callback": () => authCallback(env, url),
      // Reject up front with a clean HTTP status; stream only the publish phase.
      "POST /edit": async () => {
        const prepared = await prepareEdit(
          env,
          request,
          (await request.json()) as EditBody,
        );
        return "done" in prepared
          ? prepared.done
          : ndjsonStream(env, request, (emit) =>
              runPublish(env, prepared.ctx, prepared.trusted, emit),
            );
      },
      "POST /move": async () =>
        movePage(env, request, (await request.json()) as MoveBody),
      "POST /merge": async () =>
        mergePages(env, request, (await request.json()) as MergeBody),
      "POST /split": async () =>
        splitPage(env, request, (await request.json()) as SplitBody),
      "POST /patrol": async () =>
        patrol(env, request, (await request.json()) as PatrolBody),
      "POST /review": async () =>
        review(env, request, (await request.json()) as ReviewBody),
      "POST /rollback": async () =>
        rollback(env, request, (await request.json()) as RollbackBody),
      "POST /ban": async () => ban(env, request, (await request.json()) as BanBody),
      "POST /unban": async () =>
        unban(env, request, (await request.json()) as UnbanBody),
      "POST /restore": async () =>
        restore(env, request, (await request.json()) as RestoreBody),
      "POST /protect": async () =>
        protect(env, request, (await request.json()) as ProtectBody),
      "POST /delete": async () =>
        deletePage(env, request, (await request.json()) as DeleteBody),
      "POST /grant": async () =>
        grant(env, request, (await request.json()) as GrantBody),
      "POST /revoke": async () =>
        revoke(env, request, (await request.json()) as GrantBody),
      "POST /suppress": async () =>
        suppress(env, request, (await request.json()) as SuppressBody),
      "POST /unsuppress": async () =>
        unsuppress(env, request, (await request.json()) as SuppressBody),
      "POST /topic": async () =>
        createTopic(env, request, (await request.json()) as TopicBody),
      "POST /comment": async () =>
        postComment(env, request, (await request.json()) as CommentBody),
    };

    const handler = routes[`${request.method} ${url.pathname}`];
    if (!handler) return json({ error: "Not found" }, 404, headers);
    try {
      const out = await handler();
      // Auth routes return a redirect Response directly; everything else is JSON.
      if (out instanceof Response) return out;
      return json(out, 200, headers);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }
  },
};
