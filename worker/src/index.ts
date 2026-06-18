import { auditLog, ban, listBans, unban } from "./handlers/bans";
import { cite } from "./handlers/cite";
import type { ClaimBody } from "./handlers/claim";
import { claim } from "./handlers/claim";
import { createTopic, getThread, listTopics, postComment } from "./handlers/comments";
import { getConfig, putConfig } from "./handlers/config";
import {
  diff,
  history,
  listChanges,
  listPending,
  pendingDiff,
  prepareEdit,
  runPublish,
} from "./handlers/content";
import { contributions } from "./handlers/contributions";
import type { DomainBody } from "./handlers/domain";
import { addDomain } from "./handlers/domain";
import {
  latestSha,
  linkGraph,
  listPages,
  pageVersions,
  searchIndex,
} from "./handlers/index-cache";
import { mergePages, movePage, splitPage } from "./handlers/lifecycle";
import {
  deletePage,
  patrol,
  patrolStatus,
  restore,
  review,
  rollback,
  tag,
} from "./handlers/moderation";
import { protect } from "./handlers/protect";
import { resolve as resolveTenantHost, tenantAvailable } from "./handlers/resolve";
import { grant, listEditors, revoke } from "./handlers/rights";
import { status as connectionStatus } from "./handlers/status";
import { listSuppressed, suppress, unsuppress } from "./handlers/suppress";
import type { TransferBody } from "./handlers/transfer";
import { transfer, transferComplete } from "./handlers/transfer";
import { corsHeaders, HttpError, json, message, ndjsonStream } from "./http";
import { whoami } from "./identity";
import { authCallback, authLogin, authStatus } from "./identity/auth";
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
  TagBody,
  TopicBody,
  UnbanBody,
} from "./types";

export { ipHash } from "./crypto";
export { authorOf, pickCategory } from "./handlers/comments";
export { signSession, verifySession } from "./identity/auth";
export { frontmatter, lastPage, pageTier } from "./trust";
export { SLUG_RE } from "./types";

// Per-endpoint shared-cache hints, applied only on a 200 GET. `s-maxage` governs
// a CDN / reverse proxy in front of the Worker (M11) — it does NOT touch the
// browser's private cache, so it can't pin a stale SHA. Anything identity- or
// moderation-specific is omitted (defaults to no shared caching). `/latest` and
// `/whoami`/`/patrol-status` are deliberately absent: the client sends those
// `no-store` and they must stay per-request fresh.
export const CACHE_CONTROL: Record<string, string> = {
  "GET /pages": "public, s-maxage=60, stale-while-revalidate=600",
  "GET /link-graph": "public, s-maxage=60, stale-while-revalidate=600",
  "GET /search-index": "public, s-maxage=60, stale-while-revalidate=600",
  "GET /history": "public, s-maxage=30, stale-while-revalidate=300",
  "GET /diff": "public, s-maxage=300, stale-while-revalidate=3600",
  "GET /cite": "public, s-maxage=3600, stale-while-revalidate=86400",
  "GET /changes": "public, s-maxage=15, stale-while-revalidate=120",
  "GET /pending": "public, s-maxage=15, stale-while-revalidate=120",
  "GET /resolve": "public, s-maxage=30, stale-while-revalidate=300",
  "GET /config": "public, s-maxage=30, stale-while-revalidate=300",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    // Operator-global endpoints, answered BEFORE the tenant gate: they read/write
    // the operator repo (registry / diagnostics / claim), not the requested tenant,
    // so they must run on the base env. `/status` also has to stay reachable for an
    // un-connected repo (it's what tells the setup page to connect).
    {
      const url = new URL(request.url);
      const key = `${request.method} ${url.pathname}`;
      const preTenant: Record<string, () => Promise<unknown>> = {
        "GET /status": () => connectionStatus(env, request),
        "GET /resolve": () => resolveTenantHost(env, request, url),
        "GET /tenant-available": () => tenantAvailable(env, url),
        "POST /claim": async () =>
          claim(env, request, (await request.json()) as ClaimBody),
        "POST /transfer": async () =>
          transfer(env, request, (await request.json()) as TransferBody),
        "POST /transfer/complete": async () =>
          transferComplete(env, request, (await request.json()) as TransferBody),
        "POST /domain": async () =>
          addDomain(env, request, (await request.json()) as DomainBody),
      };
      const pre = preTenant[key];
      if (pre) {
        try {
          const cc = CACHE_CONTROL[key];
          return json(
            await pre(),
            200,
            cc ? { ...headers, "Cache-Control": cc } : headers,
          );
        } catch (err) {
          const code = err instanceof HttpError ? err.status : 500;
          return json({ error: message(err) }, code, headers);
        }
      }
    }

    // Scope env to the request's target repo (no-op single-tenant). A bad/unknown
    // repo is rejected here with a clean status before any route runs.
    try {
      env = await resolveTenant(env, request);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }

    const url = new URL(request.url);
    // Behind a TLS-terminating reverse proxy (Coolify/Traefik) the container sees
    // the request over plain HTTP, so `request.url` is `http://…`. Honour the
    // forwarded scheme/host so OAuth redirect URIs and canonical links are the
    // real external `https://…` ones the browser and GitHub expect.
    const fwdProto = request.headers.get("x-forwarded-proto");
    if (fwdProto) url.protocol = `${fwdProto.split(",")[0].trim()}:`;
    const fwdHost = request.headers.get("x-forwarded-host");
    if (fwdHost) url.host = fwdHost.split(",")[0].trim();
    const q = url.searchParams;
    const routes: Record<string, () => Promise<unknown>> = {
      "GET /latest": () => latestSha(env),
      "GET /version": () => pageVersions(env),
      "GET /pages": () => listPages(env),
      "GET /link-graph": () => linkGraph(env),
      "GET /search-index": () => searchIndex(env),
      "GET /cite": () => cite(env, q.get("q") ?? ""),
      "GET /history": () =>
        history(env, q.get("slug") ?? "", q.get("page") ?? undefined),
      "GET /diff": () =>
        diff(env, q.get("slug") ?? "", q.get("base") ?? "", q.get("head") ?? ""),
      "GET /topics": () => listTopics(env, q.get("slug") ?? ""),
      "GET /topic": () => getThread(env, q.get("id") ?? ""),
      "GET /whoami": () => whoami(env, request),
      "GET /config": () => getConfig(env),
      "GET /changes": () =>
        listChanges(env, {
          limit: q.get("limit") ?? undefined,
          page: q.get("page") ?? undefined,
          author: q.get("author") ?? undefined,
          unreviewed: q.get("unreviewed") ?? undefined,
          highRisk: q.get("highRisk") ?? undefined,
        }),
      "GET /contributions": () =>
        contributions(env, q.get("author") ?? "", q.get("page") ?? undefined),
      "GET /pending": () => listPending(env),
      "GET /pending-diff": () => pendingDiff(env, q.get("number") ?? ""),
      "GET /bans": () => listBans(env),
      "GET /audit": () => auditLog(env, request, q.get("limit") ?? ""),
      "GET /patrol-status": () => patrolStatus(env, q.get("slug") ?? ""),
      "GET /editors": () => listEditors(env, request),
      "GET /suppressed": () => listSuppressed(env, request),
      "GET /auth/status": () => Promise.resolve(authStatus(env)),
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
      "POST /config": async () => putConfig(env, request, await request.json()),
      "POST /move": async () =>
        movePage(env, request, (await request.json()) as MoveBody),
      "POST /merge": async () =>
        mergePages(env, request, (await request.json()) as MergeBody),
      "POST /split": async () =>
        splitPage(env, request, (await request.json()) as SplitBody),
      "POST /patrol": async () =>
        patrol(env, request, (await request.json()) as PatrolBody),
      "POST /tag": async () => tag(env, request, (await request.json()) as TagBody),
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
      const cc = CACHE_CONTROL[`${request.method} ${url.pathname}`];
      return json(out, 200, cc ? { ...headers, "Cache-Control": cc } : headers);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: message(err) }, status, headers);
    }
  },
};
