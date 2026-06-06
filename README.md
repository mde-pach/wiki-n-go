# Wikigit

A collaborative wiki that **renders without rebuilds** and is **edited in-site
with Wikipedia-level friction** — no account, no token. The GitHub repo,
Discussions, and Actions are the database; this app is the interface.

**Live:** https://mde-pach.github.io/wiki-n-go/ · **Spec & tracker:** [`SPEC.md`](./SPEC.md)

> The product is **Wikigit**; the hosting identifiers below (repo `mde-pach/wiki-n-go`,
> the Pages path, the Worker URL) keep their original names so the live deployment
> stays valid.

- **Read** — content fetched from GitHub via jsDelivr (pinned to the latest
  commit SHA), rendered client-side. No rebuild when content changes.
- **Edit** — in-site editor → one Cloudflare Worker → opens a PR as
  `anon-<ip_hash>`, or (for trusted editors / open pages) commits live.
  Rate-limited, bot-checked (Turnstile), ban-able.
- **Discuss** — anonymous comments via the Worker → GitHub Discussions,
  threaded, one topic per thread (no GitHub login required to post).

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

## Enable editing — the `/setup` wizard

There is **one** way to wire up editing: open **`/setup`** on your site and follow
three steps. No personal access token, no Cloudflare API token, no hand-edited
config, no GitHub-Actions secrets.

1. **Create the bot** — the wizard opens GitHub's "Create GitHub App" page with
   everything pre-filled (it asks only for Contents + Pull requests + Discussions
   write). Confirm, and GitHub hands the wizard the app's ID and private key
   client-side. The wizard also generates your `HASH_SECRET`.
2. **Deploy the Worker** — one **Deploy to Cloudflare** click provisions the Worker
   and its KV namespace from your `worker/` folder, sets up automatic redeploys on
   future pushes, and prompts for the three values above plus `REPO_OWNER` /
   `REPO_NAME`.
3. **Install the app** on your repo and set the `WORKER_URL` repo variable to the
   deployed `*.workers.dev` URL.

That's it. The Worker mints short-lived, repo-scoped **installation tokens** from
the App — nothing long-lived to store or rotate. The private key is GitHub's
PKCS#1 PEM as-is; the Worker wraps it (no `openssl` step). Because Cloudflare owns
the KV namespace and the redeploys, the Worker always keeps the same KV instance
across updates.

**Staying up to date.** Step 2 wires up Cloudflare Workers Builds, which redeploys
on every push to your default branch. So when this upstream repo ships a Worker fix
— a new feature or a security patch — you just **merge it into your `main`** and
Cloudflare redeploys the new Worker automatically, reusing your existing secrets and
KV. No re-running setup, no re-entering credentials.

**Discussion** works with no extra setup — anonymous comments post through the same
Worker to GitHub Discussions (the **General** category by default; change
`DISCUSSION_CATEGORY` in the Worker's variables). Just enable Discussions on the
repo.

### Optional add-ons (set as Worker variables/secrets in the Cloudflare dashboard)

- **Bot check** — create a Turnstile widget; set the Worker secret
  `TURNSTILE_SECRET` and the site variable `TURNSTILE_SITE_KEY`.
- **GitHub sign-in** — see below; set `OAUTH_CLIENT_ID` (variable),
  `OAUTH_CLIENT_SECRET` and a random `SESSION_SECRET` (secrets) on the Worker.

## Optional: GitHub sign-in (attribution)

Anonymous editing is the primary path; signing in just attaches a contributor's
real GitHub identity to their edits and talk posts. It stays disabled until
wired:

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - **Homepage URL** — your site origin (e.g. `https://mde-pach.github.io`).
   - **Authorization callback URL** — `<workerUrl>/auth/callback` (your Worker's
     URL + `/auth/callback`).
2. On the **Worker** (Cloudflare dashboard → your Worker → Settings → Variables),
   add the variable `OAUTH_CLIENT_ID` (public) and the secrets `OAUTH_CLIENT_SECRET`
   and `SESSION_SECRET` (any long random string). Also set the site variable
   `OAUTH_CLIENT_ID` so the build knows sign-in is available.
3. The **Sign in** button appears on its own — the site reads sign-in status from
   the Worker at runtime (no flag, no rebuild). Until these are set, editing stays
   anonymous.

The Worker only requests `read:user` and never stores a user token or email —
commits are attributed via GitHub's public no-reply email, so no PII enters the
repo. Signed-in users follow the same trust gate as anonymous ones.

## Roadmap

See [`SPEC.md`](./SPEC.md). Done: reader, anonymous editing, moderation
(rate-limit + bans + Turnstile), discussions, optional GitHub sign-in for
attribution.
