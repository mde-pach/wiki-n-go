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
  proposeEdit,
} from "./handlers/content";
import { latestSha, linkGraph, listPages, searchIndex } from "./handlers/index-cache";
import { patrol, review, rollback } from "./handlers/moderation";
import { corsHeaders, HttpError, json, message } from "./http";
import { whoami } from "./identity";
import type {
  BanBody,
  CommentBody,
  EditBody,
  Env,
  MoveBody,
  PatrolBody,
  ReviewBody,
  RollbackBody,
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
      "GET /pending": () => listPending(env),
      "GET /pending-diff": () => pendingDiff(env, q.get("number") ?? ""),
      "GET /bans": () => listBans(env),
      "GET /audit": () => auditLog(env, request, q.get("limit") ?? ""),
      "GET /auth/status": () => Promise.resolve({ enabled: oauthConfigured(env) }),
      "GET /auth/login": () => authLogin(env, url),
      "GET /auth/callback": () => authCallback(env, url),
      "POST /edit": async () =>
        proposeEdit(env, request, (await request.json()) as EditBody),
      "POST /move": async () =>
        movePage(env, request, (await request.json()) as MoveBody),
      "POST /patrol": async () =>
        patrol(env, request, (await request.json()) as PatrolBody),
      "POST /review": async () =>
        review(env, request, (await request.json()) as ReviewBody),
      "POST /rollback": async () =>
        rollback(env, request, (await request.json()) as RollbackBody),
      "POST /ban": async () => ban(env, request, (await request.json()) as BanBody),
      "POST /unban": async () =>
        unban(env, request, (await request.json()) as UnbanBody),
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
