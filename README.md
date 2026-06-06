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
- **Discuss** — anonymous comments through the same Worker to GitHub
  Discussions, one thread per page.

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

## Enable editing — the `/setup` wizard (recommended)

Open **`/setup`** on your deployed site and follow three steps. No personal
access token, no Cloudflare API token, no hand-edited config:

1. **Create the bot** — the wizard opens GitHub's "Create GitHub App" page with
   everything pre-filled (it asks only for Contents + Pull requests + Discussions
   write). Confirm, and GitHub hands the wizard the app's ID and private key
   client-side. The wizard also generates your `HASH_SECRET`.
2. **Deploy the Worker** — one **Deploy to Cloudflare** click clones your
   `worker/` folder, provisions the KV namespace, and prompts for those three
   values plus `REPO_OWNER` / `REPO_NAME`.
3. **Install the app** on your repo and set the `WORKER_URL` repo variable to the
   deployed URL.

The Worker mints short-lived, repo-scoped **installation tokens** from the App —
nothing long-lived to store or rotate. The private key is GitHub's PKCS#1 PEM
as-is; the Worker wraps it (no `openssl` step).

### Legacy: GitHub-Actions deploy with a bot PAT

The original CI path still works. Under Settings → Secrets and variables →
Actions add secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and **either**
the App (`GH_APP_PRIVATE_KEY` secret + `GH_APP_ID` variable) **or** a
`WORKER_GITHUB_TOKEN` PAT (fine-grained, Contents + Pull requests + Discussions
write). `HASH_SECRET`/`SESSION_SECRET` are generated on first deploy and never
rotated; `WORKER_URL` is recorded automatically (grant Variables:write) or set it
once from the deploy log.

- **Bot check** — create a Turnstile widget; add the secret `TURNSTILE_SECRET`
  and the variable `TURNSTILE_SITE_KEY`.
- **Discussion** — anonymous comments post through the same Worker to GitHub
  Discussions (the **General** category by default — change `DISCUSSION_CATEGORY`
  in `wrangler.toml`). Just enable Discussions on the repo.

## Optional: GitHub sign-in (attribution)

Anonymous editing is the primary path; signing in just attaches a contributor's
real GitHub identity to their edits and talk posts. It stays disabled until
wired:

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - **Homepage URL** — your site origin (e.g. `https://mde-pach.github.io`).
   - **Authorization callback URL** — `<workerUrl>/auth/callback` (your Worker's
     URL + `/auth/callback`).
2. Under **Settings → Secrets and variables → Actions** (repo level, *not* an
   Environment), add the **variable** `OAUTH_CLIENT_ID` (public) and the
   **secret** `OAUTH_CLIENT_SECRET`.
3. Run the **Deploy Worker** action. That's it — `OAUTH_CLIENT_ID` is injected at
   deploy, `SESSION_SECRET` is auto-generated, and the **Sign in** button appears
   on its own (the site reads sign-in status from the Worker at runtime — no flag,
   no rebuild). Until then, editing stays anonymous.

The Worker only requests `read:user` and never stores a user token or email —
commits are attributed via GitHub's public no-reply email, so no PII enters the
repo. Signed-in users follow the same trust gate as anonymous ones.

## Roadmap

See [`SPEC.md`](./SPEC.md). Done: reader, anonymous editing, moderation
(rate-limit + bans + Turnstile), discussions, optional GitHub sign-in for
attribution.
