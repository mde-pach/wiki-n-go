# Fork-and-Go Wiki

A collaborative wiki that **renders without rebuilds** and is **edited in-site
with Wikipedia-level friction** — no account, no token. The GitHub repo,
Discussions, and Actions are the database; this app is the interface.

**Live:** https://mde-pach.github.io/wiki-n-go/ · **Spec & tracker:** [`SPEC.md`](./SPEC.md)

- **Read** — content fetched from GitHub via jsDelivr (pinned to the latest
  commit SHA), rendered client-side. No rebuild when content changes.
- **Edit** — in-site editor → one Cloudflare Worker → opens a PR as
  `anon-<ip_hash>`. Rate-limited, bot-checked (Turnstile), ban-able; nothing
  auto-merges.
- **Discuss** — giscus over GitHub Discussions, one thread per page.

## Deploy your own

The reader is a static site — deploy it anywhere:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/mde-pach/wiki-n-go)
[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mde-pach/wiki-n-go)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mde-pach/wiki-n-go)

Or fork and enable **Settings → Pages → Source: GitHub Actions**.

## Develop

```bash
bun install
bun run dev      # local dev server
bun run build    # production build to ./dist
bun run check    # Biome lint + format (write)
```

Point [`src/config.ts`](./src/config.ts) at your content repo (`repoOwner` /
`repoName`). For a GitHub Pages project site, set `site` + `base` in
[`astro.config.mjs`](./astro.config.mjs).

## Enable editing & discussion (one-time)

- **Editing** — `cd worker`, fill `worker/.deploy.env` (Cloudflare token, GitHub
  PAT), run `./deploy.sh`, then set `workerUrl` in `src/config.ts`.
- **Bot check** — create a Turnstile widget; set `turnstileSiteKey` in config and
  `TURNSTILE_SECRET` in `worker/.deploy.env`.
- **Discussion** — install the [giscus app](https://github.com/apps/giscus) on
  the repo, enable Discussions, and set `giscus.*` in config.

## Optional: GitHub sign-in (attribution)

Anonymous editing is the primary path; signing in just attaches a contributor's
real GitHub identity to their edits and talk posts. It stays disabled until
wired:

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - **Homepage URL** — your site origin (e.g. `https://mde-pach.github.io`).
   - **Authorization callback URL** — `<workerUrl>/auth/callback`.
2. Give the Worker its credentials: set `OAUTH_CLIENT_ID` as a `[vars]` entry in
   `worker/wrangler.toml`, and the secrets `OAUTH_CLIENT_SECRET` and
   `SESSION_SECRET` (a long random string) via `wrangler secret put` (or
   `worker/.dev.vars` locally).
3. Flip `oauthEnabled: true` in [`src/config.ts`](./src/config.ts).

The Worker only requests `read:user` and never stores a user token or email —
commits are attributed via GitHub's public no-reply email, so no PII enters the
repo. Signed-in users follow the same trust gate as anonymous ones.

## Roadmap

See [`SPEC.md`](./SPEC.md). Done: reader, anonymous editing, moderation
(rate-limit + bans + Turnstile), discussions, optional GitHub sign-in for
attribution.
