# 11 — M11: Portable backend (Bun server, no-DB, self-hostable)

> Strategic pivot, decided 2026-06-14. Moves the Engine's backend **off the
> single Cloudflare Worker** and onto a **portable Bun server** that wikigit.org
> runs centrally (multi-tenant, free for end users) and that anyone can self-host
> on their own machine. Cloudflare becomes *one* place you can run it, not *the*
> built-in answer.

This doc is the design + migration plan for M11. It assumes the architecture in
`SPEC.md` and the current-state findings in reports 01–10. It does **not** change
the read path (jsDelivr@sha + static islands) — only the editing/dynamic backend.

## Decisions (locked 2026-06-14)

| # | Decision | Choice |
|---|---|---|
| D1 | Runtime | **Bun server** (one process, like `accounts/`), not edge functions |
| D2 | State store | **No DB — memory + git.** Ephemeral state in-memory; durable state in git files |
| D3 | Central hosting scope | **Backend only.** Content stays in each user's GitHub repo, read via CDN. wikigit.org relays writes + serves dynamic endpoints |
| D4 | Self-host artifact | **Bun binary** (`bun run start`) + a one-liner; self-hoster owns process/TLS (reverse proxy). No container required |
| D5 | Durable moderation state | Patrol bits + change tags move from KV to a git append-log (`.wikigit/moderation.jsonl`), hydrated to memory on boot |

These keep the project's no-DB / no-second-store ethos intact while making the
backend run anywhere Bun runs.

## Why this is tractable

1. **Precedent.** `accounts/` (the Wikigit IdP) already made exactly this move —
   off Workers onto a **Bun app on Coolify** (the 10 ms-CPU cap couldn't do
   OpenAuth's RSA keygen). Same template for the Engine backend.
2. **One seam.** Every stateful call already routes through `namespacedKV`
   (`worker/src/tenant.ts`) — a KV-shaped interface (`get`/`put`/TTL, per-repo
   prefix). Reimplement *that interface* over an in-memory store and most handlers
   (`worker/src/handlers/*`, `identity/`, `trust`, `risk`, `cite`, `indexlib`)
   move almost unchanged.
3. **Reads never hit the server.** The read path is CDN-served; the backend only
   handles **writes + a few dynamic GETs** (index, changes, whoami, cite,
   discussions, admin), most cacheable. So "free for end users" is affordable —
   the bulk of traffic (reads) is already free on jsDelivr.

## State model under "no-DB (memory + git)"

The key realization that makes no-DB viable on a real server: **most "state" is
already signature-based, not store-based**, so it survives restarts with no store.

### Stateless (survives restart, no store needed)
- **Sessions** — HS256 JWTs the server mints, client replays; verified by
  signature (`identity/`). No session table.
- **OAuth/login state** — signed-state token (`signState`/`verifyState`).
- **PoW tokens** — self-verifying `<ts>.<salt>.<nonce>`, re-hashed once
  (`verifyPow`). Only the *single-use* marker is stateful.

### Ephemeral in-memory (lost on restart — and that's fine)
A `MemoryKV` (Map + TTL sweep) behind the `namespacedKV` interface holds:
- rate-limit fixed-window counters, PoW single-use set, 3RR counters — all
  short-lived; a restart at worst resets a window / opens a ~2-min PoW-replay gap.
- trust cache, link-graph/search index, cite cache — pure caches, **rebuilt from
  git/content on miss** (the rebuild-on-cache-miss + static-`*.json` fallback
  already exist). A restart just re-warms them.

### Durable in git (the source of truth)
Already git files: `bans.json`, `trusted-editors.json`, `suppressed.json`,
`audit-log.jsonl`. **New (D5):** patrol bits (`patrol:<sha>`) and manual change
tags (`tag:<sha>`) — currently KV, not derivable from content — move to a single
append-only **`.wikigit/moderation.jsonl`** (same pattern as `audit-log.jsonl`):
the server hydrates it into memory at boot, serves/updates from memory, and
appends a line to git on each patrol/tag action. Git is durable truth; memory is
the fast layer. (Rejected alternative: leave them fail-open ephemeral — simpler,
but a redeploy re-shows every page as unpatrolled.)

## Scaling: vertical-first, shard-by-tenant as the exit

No-DB means processes can't share rate-limit/PoW state, so the central instance
**scales vertically, not by spraying stateless processes**. For a *write* backend
that is plenty for a long time: write volume is a rounding error next to reads,
and reads don't touch the server. The known ceiling and its no-DB-preserving exit:

- **Now:** one Bun process per instance. Fine to a high write rate.
- **Later (if needed):** **shard by tenant** — consistent-hash `repo → process`,
  so each tenant's counters live in exactly one process. Correctness intact, still
  no shared store. This is the planned scale path, written down so it isn't a
  surprise dead-end.

## Migration plan (phased)

Each phase ships independently; the HTTP contract with the frontend is preserved
throughout, so the frontend cutover (M11.4) can lag the backend.

- **M11.1 — Store abstraction.** Extract the `namespacedKV` shape into an explicit
  `Store` interface (`get`/`put`/`withTTL`/`incr`/list-prefix). Implement
  `MemoryKV` (Map + lazy TTL expiry). Keep the CF `KVNamespace` impl temporarily
  so both run. Unit-test TTL/expiry/namespacing parity with the existing tenant
  tests.
- **M11.2 — Bun server runtime.** Wrap the Worker's `fetch(request, env, ctx)`
  router in `Bun.serve`. `env` becomes a plain config object built from
  `process.env` + the `MemoryKV` binding. `ctx.waitUntil(p)` → a fire-and-forget
  tracked set drained on graceful shutdown (`SIGTERM`). Confirm `githubApp.ts`
  (jose / Web Crypto) and `crypto.ts` run on Bun unchanged. Port the worker test
  suite to run against the Bun handler.
- **M11.3 — Durable moderation log (D5).** Replace `patrol:`/`tag:` KV reads/writes
  with `.wikigit/moderation.jsonl` (append on action, hydrate on boot into the
  in-memory view the read endpoints already use). Reuse the `audit-log.jsonl`
  commit path. Migration: one-time backfill from current KV if any production
  patrol state matters (pre-release: likely skip).
- **M11.4 — Frontend config.** Rename `config.workerUrl` → `serverUrl`
  (`PUBLIC_API_URL`), pointed at wikigit.org or the self-host URL. No endpoint or
  payload changes. Update `/setup` (see M11.6).
- **M11.5 — Deploy & ops.** Ship the Bun app with `bun run start`, a sample
  `systemd` unit + reverse-proxy (Caddy/nginx, TLS) snippet, and an env reference
  (secrets that were Worker secrets: App id/key, `HASH_SECRET`, OAuth, SMTP).
  wikigit.org runs it on the existing Coolify box beside `accounts/`.
- **M11.6 — Retire the Cloudflare-specific surface.** Remove/relegate: the
  `/setup` Deploy-to-Cloudflare wizard + Workers Builds path, `wrangler.toml`, KV
  bindings, and the `EDGE_SSR=cloudflare` Pages variant. Keep Cloudflare *possible*
  as a documented "advanced" option (Workers Containers or CF-in-front-of-Bun),
  not the built-in. The **PKCE-watch** open decision is dropped — a real server
  holds the OAuth client secret fine, so there's nothing to wait on.

## What changes in the existing tracker (Cloudflare-tied items)

- **SPEC §5 "one Worker is irreducible"** — the *argument* is runtime-agnostic
  (anonymous writes need a server-held credential the browser can't hold). Only the
  noun changes: "the Worker" → "the portable server." No invariant lost.
- **SPEC §8 Tech Stack** — "one Cloudflare Worker" → "one portable Bun server
  (M11); Cloudflare Worker was the original runtime." Edge-SSR-on-CF-Pages becomes
  optional/legacy; the Bun server can SSR the content route natively if SEO needs
  it, else static+CDN reads are unchanged.
- **SPEC §10 Open Decisions** — *PKCE watch* → resolved/moot (M11). *SHA
  resolution* and *rate-limiting* note "KV" → now the in-memory store; mechanism
  (fixed-window, `/latest` cache) is unchanged, only the backing store.
- **Roadmap PERF-4 / P1-3 (edge cache headers on Worker JSON)** — reframed: on a
  Bun server you set standard HTTP `Cache-Control` and lean on a **reverse-proxy
  or optional CDN** in front, not CF edge KV. Same goal (cacheable dynamic GETs),
  portable mechanism.
- **Roadmap PERF-3 (read-path waterfall)** — unchanged in substance (jsDelivr is
  the CDN regardless); the Bun server can additionally collapse some GETs.
- **The security/correctness P0s (SSRF, infobox XSS, name-keyed trust, the
  empty-editor RT-1) are runtime-agnostic** — fix them on the current Worker now;
  they travel to Bun untouched. M11 is not a reason to defer them.

## Open questions

- **TLS/ops burden for self-hosters (D4).** A bare Bun binary needs the operator
  to run a reverse proxy + certs. Acceptable, but document a Caddy one-liner; revisit
  whether an optional container image is worth shipping for the non-ops crowd
  (decided *against* as the canonical artifact, but it could be a convenience).
- **`.wikigit/moderation.jsonl` growth** — append-only log compaction strategy
  (snapshot + truncate) once it's large; mirror whatever `audit-log.jsonl` does.
- **Multi-process on one box** — if vertical scale needs Bun cluster/workers
  before tenant-sharding is built, those share no memory either; pin to one process
  until sharding lands.
- **Discussions** still ride GitHub Discussions via the bot — unaffected, stays.
