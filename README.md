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

## Roadmap

See [`SPEC.md`](./SPEC.md). Done: reader, anonymous editing, moderation
(rate-limit + bans + Turnstile), discussions. Next: optional GitHub sign-in for
attribution.
