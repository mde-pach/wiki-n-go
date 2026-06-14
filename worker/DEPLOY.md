# Deploying the Engine backend (Bun) on Coolify

The Engine backend runs as a single Bun process (M11). It is **no-DB**: all KV
state is in-memory and rebuilt from git on a miss, so there is nothing to persist
and **no volume to mount**. A restart loses nothing durable.

This mirrors the `accounts/` deployment (Bun on Coolify), so the platform setup is
familiar.

## 1. Create the resource

In Coolify: **New Resource → Docker (Dockerfile)** (or "Application" → Build Pack:
Dockerfile), pointing at this repo with **Base Directory = `worker`** so it builds
`worker/Dockerfile`.

- Port: **8787** (the container `EXPOSE`s it; Coolify maps your domain to it).
- Health check path: **`/health`** (returns `200 ok`, no external deps).
- Attach your domain, e.g. `api.wikigit.org`, and let Coolify issue TLS.

## 2. Environment variables

Set these in Coolify (the same names the Worker uses — see `src/types.ts`):

**Required**

| Var | Value |
|---|---|
| `HASH_SECRET` | a long random string (the `ip_hash` HMAC key) |
| `REPO_OWNER` | e.g. `mde-pach` |
| `REPO_NAME` | e.g. `wiki-n-go` |
| `ALLOWED_ORIGIN` | comma list, e.g. `https://wikigit.org,https://*.wikigit.org` |

**Write credential — set ONE**

- GitHub App (recommended): `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (PKCS#8
  PEM; paste the multi-line value as-is). Optional `GITHUB_APP_INSTALLATION_ID`.
- Bot PAT (legacy): `GITHUB_TOKEN` (contents + PRs write scope).

**Optional**

- `BRANCH` (default `main`), `CONTENT_DIR` (default `content`), `HOME_SLUG`.
- Sign-in: `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_SECRET` + `SESSION_SECRET` (GitHub),
  and/or `WIKIGIT_ISSUER` + `WIKIGIT_CLIENT_ID` (Wikigit accounts).
- Autonomy knobs: `DEFAULT_EDIT_TIER`, `AUTOCONFIRM_EDITS`, `AUTOPATROL_TIER`,
  `AUTOMOD_REVERT_SCORE`, … (all default to the reviewed-PR model).
- Multi-tenant (one backend for many repos, giscus model): `MULTI_TENANT=1`
  (requires the GitHub App credential).
- `PORT` (default 8787) — only if you remap.

## 3. Point the frontend at it

Build the site with `PUBLIC_WORKER_URL=https://api.wikigit.org` (the GitHub
Pages / CF Pages workflow injects this; the literal in `src/config.ts` is the
fallback). No other frontend change — the HTTP contract is identical to the CF
Worker.

## 4. Verify after deploy

```sh
curl https://api.wikigit.org/health        # → ok
curl https://api.wikigit.org/auth/status   # → {"enabled":…}
curl https://api.wikigit.org/latest        # → {"sha":"…"} once creds are set
```

## Local / Docker test

```sh
# Bare Bun
HASH_SECRET=x REPO_OWNER=o REPO_NAME=r ALLOWED_ORIGIN=http://localhost:4321 \
  bun run start            # listens on :8787

# Docker (what Coolify builds)
docker build -t wikigit-engine worker
docker run -p 8787:8787 -e HASH_SECRET=x -e REPO_OWNER=o -e REPO_NAME=r \
  -e ALLOWED_ORIGIN=http://localhost:4321 wikigit-engine
```

## Scaling note

One process owns the in-memory KV, so run **a single instance** (vertical scale).
The backend only handles writes + a few dynamic GETs — reads are served from the
CDN (jsDelivr), so one box goes a long way. If you ever outgrow it, shard by
tenant (`repo → process`) rather than load-balancing identical instances, which
would split the rate-limit/PoW state. See SPEC §M11.
