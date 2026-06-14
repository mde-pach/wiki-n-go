# 12 — Hosted platform & non-technical onboarding (design)

> Goal: Wikigit is open source AND a hosted product run under **wikigit.org**.
> A non-technical person should get a live wiki in a few clicks — using **their
> own GitHub repo + GitHub Pages**, with **no server of their own** (they plug
> onto the operator's Engine), and optionally a **`foo.wikigit.org` subdomain**.
> Configuration happens in the **UI** (a setup/status page, click-to-connect),
> not in code or dashboards. Self-hosting everything stays fully supported.

## The three deploy paths (one codebase)

| Path | Frontend (reader) | Backend (Engine) | Who | Server? |
|---|---|---|---|---|
| **A. Hosted subdomain** | `foo.wikigit.org` — operator's **one shared tenant-aware** static frontend | operator's **multi-tenant** Engine (`api.wikigit.org`) | non-technical, max-easy | none |
| **B. Bring-your-own Pages** | the user's **GitHub Pages** (`user.github.io/repo`), zero-config fork | operator's multi-tenant Engine | semi-technical (can use GitHub) | none |
| **C. Full self-host** | their static host | **their own** single-tenant Engine (Bun/Coolify/…) | sovereign / private | their box |

The content + history + identity model is identical in all three: content lives
in the user's **GitHub repo**, read via jsDelivr@sha; the Engine is the only
writer (holds the GitHub App credential); edits are PRs/commits as `anon-<hash>`
or a signed-in identity. Only *who hosts the two deployables* differs.

## The key enabler: the reader is **tenant-aware**

A wiki = one GitHub repo. The reader must answer "**which repo am I?**":

- **Baked (paths B, C):** `config.repoOwner/repoName` from `PUBLIC_REPO_OWNER/NAME`,
  injected at the fork's build from GitHub context. Zero edits.
- **Runtime (path A):** the shared `foo.wikigit.org` frontend is **one build** —
  it can't bake per-tenant config. It derives the tenant from its **hostname**
  (`foo` → repo) via the Engine's subdomain registry, resolved on load + cached.

So the reader resolves an **active repo** (`lib/engine.ts → activeRepo()`), and
every Engine request **names that repo** — `?repo=owner/name` (a query param, not
a header, so simple GETs avoid a CORS preflight). The Engine is multi-tenant: it
serves whichever repo the request names (validated against the App's installs,
KV namespaced per repo — M9, already built). A single-tenant self-host Engine
ignores the param. → **a fork plugs onto wikigit.org with zero config.**

## Subdomain model (`*.wikigit.org`)

- DNS: a **wildcard `*.wikigit.org`** record (operator's Cloudflare zone) → the
  shared frontend host. Reserved names (`api`, `auth`, `www`, apex) are explicit.
- A **tenant registry** maps `subdomain → owner/repo` (+ owner identity, created
  date). Stored where the Engine already keeps committed state: a git file in the
  operator's config repo (e.g. `tenants.jsonl`, the `audit-log.jsonl` pattern) —
  no DB, consistent with the Engine invariant. The Engine serves it via
  `GET /resolve?host=foo.wikigit.org → {repo}` (cached).
- The shared frontend, on boot, calls `/resolve` for its hostname → sets the
  active repo → renders that wiki. Apex/unknown subdomain → a landing/"claim this
  name" page.

## Registration / provisioning (the "Hub", non-technical)

A claim flow, all in-UI:
1. **Sign in** (Wikigit account or GitHub) to own the claim.
2. **Pick a name** → `foo.wikigit.org` (availability checked against the registry;
   reserved-word + profanity guard).
3. **Connect a repo** → "Install the Wikigit App" (one GitHub click) → the App
   install tells the Engine the repo is served; the Hub records `foo → owner/repo`.
   (Or "create one for me" → use-this-template flow.)
4. Done — `foo.wikigit.org` is live. No DNS, no Pages, no server.

Provisioning is just a **registry write** (the wildcard DNS + shared frontend
already exist) — cheap, instant, reversible. DNS automation (Cloudflare API) is
only needed for *custom* domains, a later add.

## Onboarding UX — the setup/status page (built in this slice)

`/setup` is a **non-technical, status-driven** page (not a wizard of forms):

- **Live status checklist**, each line green/amber/red with a one-click fix:
  - *Backend* — reachable? which Engine (hosted vs self).
  - *This wiki connected* — is the repo served? if not → **“Connect” = install the
    Wikigit App** (one click, deep-linked to the repo).
  - *Reading* — content source (repo @ CDN) + the live URL.
  - *Sign-in* — GitHub / Wikigit available, or "anonymous-only" + how to enable.
  - *(self-host)* write credential configured?
- **Click-to-connect** actions + friendly copy; no IDs to paste, no tokens.
- Powered by a single Engine **`/status`** diagnostics endpoint (mode, repo,
  served, sign-in, write-credential) that's reachable even for an un-connected
  repo (so it can tell you to connect).

## Further facilitation for non-technical users (prioritised)

1. **Use-this-template** one-click repo creation (reader + Pages workflow + starter
   content) → path B with no manual file copying. *(repo setup)*
2. **Click-to-connect app install** — the single most important action; deep-links
   to install the App on the chosen repo. *(built: link; Hub records the mapping)*
3. **Setup/status page** with live health + guided fixes. *(this slice)*
4. **Zero-config repo detection** — baked (fork) or hostname (subdomain). *(this slice)*
5. **In-UI settings editor** — edit site title, languages, appearance, sign-in,
   protection defaults through a form that **commits a `wikigit.config.*` file to
   the repo** (no code editing). The reader already reads config; make it
   repo-file-driven + UI-editable. *(high-value next)*
6. **Hub dashboard** (`wikigit.org`) — manage your wiki(s): status, content stats,
   recent changes, moderation queue, editors, custom domain, (later) quotas/billing.
7. **Health + notifications** — "your backend/Pages build is down", "you were
   reverted/replied-to" (ties into watchlist/notifications, FEATURES §Q).
8. **One-click content import** — Markdown upload, Notion/Confluence/Wikipedia.
9. **Guided first-run** — after connect: "write your first page → invite editors →
   set who can edit." A checklist that completes itself from live state.
10. **Maintenance-free updates** — the Engine is operator-run (always current for
    hosted users); the reader is a thin static shell. Self-hosters get a
    "your Engine is N versions behind" nudge on the status page.
11. **Abuse/quota controls** for the shared Engine — per-repo rate limits already
    namespaced (M9); add per-tenant ceilings + a kill-switch in the Hub.
12. **Custom-domain helper** — guided CNAME/verification for `wiki.mybrand.com`.

## Phased roadmap

- **P1 — this slice (built now):** tenant-aware reader (`activeRepo`, `?repo=`
  plumbing) · Engine `/status` · `/setup` status+connect page · config flags.
- **P2 — Hub MVP:** subdomain registry (`tenants.jsonl`) + `/resolve` + the shared
  frontend's hostname→tenant boot + the claim flow (sign-in → name → connect).
  Requires the Engine on the **GitHub App** credential + `MULTI_TENANT=1` (today
  it runs a PAT, single-tenant — flip once the App key is set).
- **P3 — In-UI settings editor** (repo-file-driven config) + use-this-template.
- **P4 — Hub dashboard, notifications, import, quotas, custom domains.**

## Hard dependency to flip the hosted model on

The shared Engine must run **`MULTI_TENANT=1`**, which **requires the GitHub App
credential** (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`) — installation tokens
are per-repo. The live Engine currently runs a personal-PAT `GITHUB_TOKEN`
(single-tenant). Generate an App private key (App `Iv23lihT3WGEzTk2bjc0` settings)
→ set the two vars in Coolify → flip `MULTI_TENANT=1`. Until then the tenant-aware
reader code is inert-safe (single-tenant Engine ignores `?repo=`).
