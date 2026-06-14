# Wikigit

A collaborative wiki that **renders without rebuilds** and is **edited in-site
with Wikipedia-level friction** — no account, no token. The GitHub repo,
Discussions, and Actions are the database; this app is the interface.

**Live:** https://mde-pach.github.io/wiki-n-go/ · **Spec & tracker:** [`SPEC.md`](./SPEC.md)

> The product is **Wikigit**; the infra identifiers below (repo `mde-pach/wiki-n-go`,
> the Pages path) keep their original names so the live deployment stays valid.

- **Read** — content fetched from GitHub via jsDelivr (pinned to the latest
  commit SHA), rendered client-side. No rebuild when content changes.
- **Edit** — in-site editor → the **Engine backend** (a portable Bun server) →
  opens a PR as `anon-<ip_hash>`, or (for trusted editors / open pages) commits
  live. Rate-limited, bot-checked (in-browser proof-of-work), ban-able.
- **Discuss** — anonymous comments via the backend → GitHub Discussions,
  threaded, one topic per thread (no GitHub login required to post).

## Architecture

Two deployables:

- **Reader** (`src/`) — an Astro static site + Solid islands. Deploy anywhere
  static (GitHub Pages by default). No backend needed to read.
- **Engine backend** (`worker/`) — a single **Bun server** (`worker/src/server.ts`),
  **no database**: ephemeral state in memory, durable state in git. It's the only
  backend, and it's portable — runs anywhere Bun runs (Coolify, Fly, a VPS).
  See [`worker/DEPLOY.md`](./worker/DEPLOY.md).

## Develop

```bash
bun install
bun run dev      # reader dev server
bun run build    # reader production build to ./dist
bun run check    # Biome lint + format (write)

cd worker && bun install
bun run dev      # backend (Bun) with --watch
bun run verify   # typecheck + tests
```

Point [`src/config.ts`](./src/config.ts) at your content repo (`repoOwner` /
`repoName`) and your backend URL (`workerUrl`, or the `PUBLIC_WORKER_URL` build
var). For a GitHub Pages project site, set `site` + `base` in
[`astro.config.mjs`](./astro.config.mjs).

### Optional: edge-SSR for SEO

By default the reader is **pure static**, so crawlers that don't run JS see an
empty shell. To server-render the content route for SEO without giving up the
no-rebuild model, build with `EDGE_SSR=netlify` (adds the Netlify adapter and
renders **only** the article route on demand — still fetching from jsDelivr@sha at
request time). Unset → byte-for-byte the static build.

## Enable editing — deploy the Engine backend

Anonymous editing needs one always-on backend that holds the GitHub write
credential (the browser can't). Deploy the Bun server in `worker/` — full
instructions in [`worker/DEPLOY.md`](./worker/DEPLOY.md). In short:

1. **Create a GitHub App** (Contents + Pull requests + Discussions write, no
   webhooks) on your repo; note its **App ID** + **private key**. Generate a random
   `HASH_SECRET`.
2. **Deploy `worker/`** to Coolify (or any host) from its `Dockerfile`; set
   `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `HASH_SECRET`, `REPO_OWNER`,
   `REPO_NAME`, `ALLOWED_ORIGIN`.
3. **Point the reader** at the backend: set the `WORKER_URL` build var (or
   `src/config.ts` `workerUrl`) to the deployed URL.

The backend mints short-lived, repo-scoped **installation tokens** from the App —
nothing long-lived to store or rotate. The private key is GitHub's PKCS#1 PEM
as-is; the server wraps it to PKCS#8 (no `openssl` step).

**Discussion** works with no extra setup — anonymous comments post through the
backend to GitHub Discussions (the **General** category by default; change
`DISCUSSION_CATEGORY`). Just enable Discussions on the repo.

### Optional add-ons (set as backend env vars on your host)

- **Bot check** — on by default, no setup: anonymous writes solve a small
  in-browser proof-of-work (no third-party service). Tune the difficulty with
  the backend env var `POW_BITS` (leading zero bits, default `18`; `0` disables);
  set the matching site var `POW_BITS` so the build solves to the same bar.
- **GitHub sign-in** — see below; set `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`
  and a random `SESSION_SECRET` on the backend.

## Optional: GitHub sign-in (attribution)

Anonymous editing is the primary path; signing in just attaches a contributor's
real GitHub identity to their edits and talk posts. It stays disabled until
wired:

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - **Homepage URL** — your site origin (e.g. `https://mde-pach.github.io`).
   - **Authorization callback URL** — `<backendUrl>/auth/callback`.
2. On the **backend** (your host's env vars), add `OAUTH_CLIENT_ID` (public),
   `OAUTH_CLIENT_SECRET` and `SESSION_SECRET` (any long random string). Also set
   the site var `OAUTH_CLIENT_ID` so the build knows sign-in is available.
3. The **Sign in** button appears on its own — the site reads sign-in status from
   the backend at runtime (no flag, no rebuild). Until these are set, editing stays
   anonymous.

The backend only requests `read:user` and never stores a user token or email —
commits are attributed via GitHub's public no-reply email, so no PII enters the
repo. Signed-in users follow the same trust gate as anonymous ones.

## Roadmap

See [`SPEC.md`](./SPEC.md). Done: reader, anonymous editing, moderation
(rate-limit + bans + proof-of-work bot check), discussions, optional GitHub
sign-in for attribution.
