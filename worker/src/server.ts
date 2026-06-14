// Bun runtime for the Engine backend (M11.2). The same `app.fetch(request, env)`
// that runs on Cloudflare Workers is served by Bun here, with `env` built from
// `process.env` + an in-memory KV (no DB — see store.ts / SPEC M11). This is the
// portable, self-hostable backend: it runs anywhere Bun runs (Coolify, Fly, a
// VPS). The Worker entry (src/index.ts) is unchanged and still deploys to CF.
//
// Run: `bun run start` (or `bun src/server.ts`). Configure via env vars — the
// same names the Worker uses (see types.ts / .dev.vars.example), plus PORT.
import app from "./index";
import { hydrateModLog } from "./modlog";
import { MemoryKV } from "./store";
import type { Env } from "./types";

// One in-memory KV for the process lifetime. Ephemeral by design: rate-limit
// windows, PoW single-use, trust/index/cite caches — all rebuildable from git
// on a miss. A restart just re-warms them.
const kv = new MemoryKV();

// Build the Worker `Env` from process.env. Strings pass straight through; the
// KV binding is our MemoryKV. Missing required secrets surface as a startup
// error rather than a confusing 500 on the first request.
function buildEnv(): Env {
  const e = process.env;
  const required = ["HASH_SECRET", "REPO_OWNER", "REPO_NAME"] as const;
  const missing = required.filter((k) => !e[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return {
    ...e,
    BRANCH: e.BRANCH ?? "main",
    CONTENT_DIR: e.CONTENT_DIR ?? "content",
    ALLOWED_ORIGIN: e.ALLOWED_ORIGIN ?? "",
    RATE_LIMIT: kv,
  } as unknown as Env;
}

const env = buildEnv();
const port = Number(process.env.PORT ?? 8787);

// Seed the in-memory store with durable moderation decisions (manual patrols +
// tags) from the git log, so they survive this restart (M11.3). Best-effort —
// a failure (no creds yet, file absent) just leaves the store empty (fail-open).
hydrateModLog(env)
  .then((n) => n > 0 && console.log(`hydrated ${n} moderation entries from git`))
  .catch((e) => console.error("mod-log hydrate skipped:", (e as Error).message));

const server = Bun.serve({
  port,
  // Coolify (and any orchestrator) health-checks a cheap endpoint; answer it
  // before delegating so it never depends on GitHub/KV being reachable.
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health" || pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }
    return app.fetch(request, env);
  },
});

console.log(`wikigit engine listening on :${server.port}`);

// Graceful shutdown so in-flight requests finish on a Coolify redeploy.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.stop();
    process.exit(0);
  });
}
