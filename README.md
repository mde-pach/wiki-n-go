# Fork-and-Go Wiki

A collaborative wiki that **renders without rebuilds** and is **edited in-site
with Wikipedia-level friction** — no account, no token. The GitHub repo,
Discussions, and Actions are the database; this app is the interface.

See [`SPEC.md`](./SPEC.md) for the full specification and tracker.

## Status: M0 — zero-infra reader

This milestone is the read path only: an Astro + Solid app that fetches Markdown
from a GitHub repo via jsDelivr (pinned to the latest commit SHA) and renders it
client-side. **No backend, deployable to GitHub Pages.**

## Configure

Edit [`src/config.ts`](./src/config.ts) and set `repoOwner` / `repoName` to the
repo holding your `content/*.md` (you can use this repo once it's on GitHub).

For a GitHub Pages **project** site, also set `site` and `base` in
[`astro.config.mjs`](./astro.config.mjs).

## Develop

```bash
bun install
bun run dev      # local dev server
bun run build    # production build to ./dist
bun run preview  # preview the build
bun run check    # Biome lint + format (write)
```

## Deploy

Pushing to `main` deploys to GitHub Pages via
[`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).
Enable **Settings → Pages → Source: GitHub Actions** once.

## Roadmap

- **M1** — in-site anonymous editing (Wikipedia friction) via one Cloudflare Worker.
- **M2** — optional "Sign in with GitHub" for attribution.
- **M3** — moderation (PR queue, `ip_hash` rate-limit, `bans.json`).
- **M4** — giscus discussion + multi-host deploy buttons.
