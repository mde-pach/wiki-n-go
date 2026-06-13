# SPEC — Wikigit

> A collaborative wiki that **renders without rebuilds** and is **edited in-site
> with Wikipedia-level friction** (no account, no token — just edit and save),
> by composing GitHub's own subsystems (git, Actions, Discussions) plus a free
> CDN as the entire stack, with one small serverless Worker as the only piece of
> infrastructure.
>
> This document is both the **specification** and the **project tracker**. Keep
> it up to date as decisions are made and milestones land.

---

## 1. Vision

A Wikipedia-style collaborative wiki for a shared document or knowledge base,
where:

- **Reading** is instant and served from a free CDN — no site rebuild on each
  commit.
- **Editing happens in the site itself** (the repo is the database, *not* the
  interface) with **Wikipedia-level friction**: click edit, type, save — no
  account and no token required.
- **Optionally**, a contributor may sign in with GitHub to attach their identity
  to an edit (attribution/credit) — but it is never required.
- **Infrastructure is near-zero**: one small serverless Worker plus a GitHub
  repo, leaning on managed third-party systems instead of self-hosting
  subsystems.

The guiding principle: **the repo, Discussions, and Actions are the database;
the site is the interface. Stop building the wiki's subsystems; compose
GitHub's.**

---

## 2. Goals & Non-Goals

### Goals
- [ ] Content stored as Markdown in a GitHub repo (git history = revision history).
- [ ] Reads served with **no rebuild per commit** and instant freshness.
- [ ] **In-site editing** (never redirect the user to GitHub's editor).
- [ ] **Anonymous editing at Wikipedia friction** as the *primary* path — no
      account, no token.
- [ ] **Optional GitHub sign-in** as a *secondary* path for attribution/credit.
- [ ] Discussion / talk layer with zero extra infra.
- [ ] Moderation that bounds the abuse surface (anon edits reviewed, rate-limited).
- [ ] Multi-host, deployable from a README "click-to-deploy" button.

### Non-Goals (for v1)
- No self-hosted database (relational or otherwise).
- No user accounts / passwords / sessions of our own.
- No raw PII (raw IPs, emails) stored in the **public** record.
- No BYO-token or "Edit on GitHub" link-out — both fail the friction bar (§5).
- No WYSIWYG parity with full CMSs — Markdown editing is enough.
- No real-time collaborative editing (CRDT/OT) — PR-based async is fine.

---

## 3. Core Principle: GitHub *is* the backend

| Wiki need | Borrowed from | We build |
|---|---|---|
| Versioned storage | git / commits | — |
| Compute / "backend" | GitHub Actions (free serverless) | — |
| Discussion layer | GitHub Discussions via giscus | — |
| Content CDN | jsDelivr (free, global) | — |
| Moderation | Pull Requests / review | policy config |
| Optional identity | GitHub OAuth | — |
| Anonymous identity | derived `ip_hash` (stateless) | the relay logic |
| **Credential to write anonymously** | — | **one Worker (irreducible — see §5)** |

Everything we build reduces to one Worker + glue.

---

## 4. Architecture

```
   READ (zero infra):
     SPA-shell on any static host ──▶ jsDelivr @<latest-commit-sha>
                                  ──▶ client-side Markdown render   [no rebuild]

   EDIT (in-site, Wikipedia friction):
     in-site editor ──▶ Worker (holds bot token)
                         ├─ derive ip_hash, rate-limit, check bans.json
                         └─ open PR, author = anon-<ip_hash>        [PRIMARY]

     (optional) "Sign in with GitHub" ──▶ Worker OAuth exchange
                         └─ open PR, author = their GitHub identity [SECONDARY]

   TALK:  giscus (GitHub Discussions)

   Infra total:  1 Cloudflare Worker  +  GitHub repo  +  Actions
```

### 4.1 Read path — "no rebuild, instant, free CDN"
- Serve content via `cdn.jsdelivr.net/gh/<owner>/<repo>@<commit-sha>/path.md`.
- Each commit = new SHA = new immutable URL → **instant freshness *and* permanent
  caching, no purge logic, no rebuild.**
- The app resolves the latest SHA at runtime (GitHub API today; see §9 for
  alternatives) and fetches + renders Markdown client-side.
- Works on **any static host**, including GitHub Pages, with **no Worker**.

### 4.2 Write path — anonymous-primary, in-site
Both modes edit **in the site** and converge on a **pull request**; only the
commit `author` differs, and the renderer is identical for both.

- **Primary — Anonymous (Wikipedia friction):** the in-site editor posts the
  edit to the Worker; the Worker holds the bot token, derives `ip_hash`,
  rate-limits, and opens a PR authored as `anon-<ip_hash>`. The user supplies
  nothing — no account, no token.
- **Secondary — GitHub sign-in (optional attribution):** "Sign in with GitHub"
  → Worker performs the OAuth token exchange → PR authored by the user's real
  GitHub identity. For contributors who *want* credit.

### 4.3 The single Worker (the only infrastructure)
One Cloudflare Worker (free tier) serves both modes:
- Anonymous relay: holds the bot token, derives `ip_hash`, enforces rate limits
  + `bans.json`, opens the PR (directly or via `repository_dispatch` → Action).
- Optional OAuth: GitHub token exchange for the sign-in path. *(The OAuth half
  becomes removable once GitHub ships client-side PKCE — §9. The anonymous half
  is irreducible — §5.)*

---

## 5. Why one Worker is irreducible

The friction goal (edit & save, no account, no token) **forces** exactly one
piece of server-side infrastructure, for reasons that are structural, not
incidental:

- **Anonymous writes need a server-held credential.** An edit must become a
  commit; a commit needs a write credential; that credential **cannot** ship to
  the browser (anyone would extract it). So *something we run* must hold the bot
  token and turn "user typed text" into a PR.
- **You cannot ride the user's existing GitHub login.** A github.com session is
  a cookie scoped to github.com; the browser deliberately blocks other origins
  from reading or sending it (SameSite + CORS — the anti-CSRF guarantee), and
  the GitHub API authenticates by token, not by that cookie. So "already logged
  in" cannot be piggybacked.
- **Therefore:** zero-infra AND Wikipedia-friction editing are mutually
  exclusive. One small (free) Worker is the irreducible price. It is invisible
  to the user — the editing experience is identical to Wikipedia's.

Rejected zero-infra alternatives (all fail the friction bar):
- BYO Personal Access Token → asks the user for a token.
- "Edit on GitHub" link-out → leaves the site; breaks the in-site premise.
- OAuth-only → requires a GitHub account + authorize click.

**The Worker is irreducible — but it need not be infra the *adopter* sets up.**
"Something we run" ≠ "the forker provisions it." Two moves collapse setup to a few
clicks (M9):
- **Credential = a GitHub App, not a bot PAT.** The Worker mints short-lived,
  repo-scoped *installation tokens* from the App (`worker/src/githubApp.ts`);
  nothing long-lived to store or rotate. PAT stays as a fallback.
- **The App is created by a client-side wizard.** GitHub's app-manifest
  conversions endpoint sends `access-control-allow-origin: *`, so `/setup` creates
  the App *and* retrieves its private key in the browser — no setup-time backend.
  A Deploy-to-Cloudflare click then provisions the Worker + KV. (A future shared
  multi-tenant instance — the giscus model — would remove even the self-host
  click; the App's per-repo token scoping already supports it.)

---

## 6. Identity Model

We never run an auth database. Identity is whatever fills the commit `author`:

| Mode | Identity source | Stored where | Notes |
|---|---|---|---|
| Anonymous (primary) | `ip_hash = HMAC(secret, ip)` | **derived, not stored** | stateless pseudonym, e.g. `anon-3f9a2c` |
| GitHub sign-in (optional) | GitHub OAuth | nowhere (GitHub's) | inherits GitHub abuse defense + attribution |

Rules:
- **Never** write a raw IP or email into the repo (immutable + public = unredactable PII).
- On a **shared multi-tenant instance** (M9) the operator's Worker sees a request's
  raw IP, but only *transiently in-memory* to derive `ip_hash` before doing anything —
  exactly as the self-hosted Worker does; nothing raw is stored or committed. The
  hash is **repo-salted** there so the same IP yields a different pseudonym per repo.
- `ip_hash` uses a **secret server-side HMAC key** (never in the repo). Bare
  `sha256(ip)` is unsafe — IPv4 is brute-forceable.
- Optional hardening: hash a coarsened input (`/24` subnet or geo region) so even
  a key leak points at a neighborhood, not a person.
- Accept the trade: putting `ip_hash` in public commits means a future key leak
  could retroactively re-identify history. Key never leaves the Worker env.

---

## 7. Moderation / Trust Model

Anonymous-primary = maximum abuse surface, so **moderation is essential, not
optional**, and is handled by **policy, not infrastructure** (Wikipedia-style
trust gradient):

| Mode | Identity | Moderation policy |
|---|---|---|
| Anonymous | `ip_hash` | **always a PR, never auto-merge**; `ip_hash` rate-limit + `bans.json` |
| GitHub sign-in | GitHub (free abuse defense) | light — auto-merge possible for trusted contributors |

- Every edit is a PR; "moderation" is mostly *not* flipping auto-merge for anon.
- `bans.json` lives **in the repo** (git is the store) — no DB.
- Rate-limit counters are the one ephemeral need: use the Worker's KV /
  rate-limit binding, OR derive from git (count recent commits by author), OR
  lean on the PR queue. Decision pending (§9).

**Planned evolution — autonomous mode (Wikipedia-like).** The reviewed-PR default
above is Wikipedia's *exception* (Pending Changes), not its norm. We will **also**
offer immediate-publish + post-hoc moderation: `ip_hash` **trust tiers**
(autoconfirmed/extended-confirmed analogs) earn auto-merge; per-path
`protection.json` + CODEOWNERS keep review *selective*; an AbuseFilter-style Worker
rule pass + per-hash rate limits + a RecentChanges/patrol queue (with
`noindex`-until-patrolled) provide the safety net; an **owner admin dashboard** is
the sysop console (bans, protection, patrol, rollback, audit log). Full feature
inventory + GitHub mapping: see `FEATURES.md` **Part II** (§§K–Q). Privacy invariant
holds and is *stronger* than Wikipedia's: `ip_hash`-only means **no CheckUser /
IP-reveal can exist** and **range-blocking is impossible** by design — accepted
costs; consider salt/epoch rotation to limit long-term linkability (M5).

---

## 8. Tech Stack

- **App:** Astro (static output) + **Solid** islands. Static HTML shell per
  route; the content area is a Solid island that fetches + renders Markdown at
  runtime (no rebuild). *Not* a SPA — mostly static HTML, islands only where
  interactive.
- **Markdown:** `markdown-it` + `DOMPurify` (client-side render + sanitize).
- **Backend (editing only):** one **portable Bun server** — anonymous relay +
  optional OAuth (OAuth half based on the `sveltia-cms-auth` pattern). *(Was a
  single Cloudflare Worker; M11 moves it to a runtime-agnostic Bun process that
  wikigit.org runs centrally and anyone can self-host. Cloudflare becomes one
  optional host, not the built-in. State is in-memory + git — no DB, see M11/§6.)*
- **Read CDN:** jsDelivr, pinned to commit SHA.
- **Discussion:** giscus (GitHub Discussions).
- **Hosting:** multi-host via **click-to-deploy** buttons (GitHub Pages /
  Cloudflare / Netlify / Vercel). **Start on GitHub Pages** (read-only phase
  needs no Worker). Avoid Vercel Hobby for production (non-commercial only).
- **Optional (shipped):** an Astro edge-SSR adapter (Cloudflare/Netlify) behind
  `EDGE_SSR`, **off by default** so GitHub Pages stays pure static. When on, only
  the content route renders on demand at the edge — fetching from jsDelivr@sha at
  request time (still no rebuild) — so crawlers get real HTML, the revision line +
  `<meta description>`/OG tags are server-rendered, and `noindex`-until-patrolled
  is resolved server-side (fail-open). The same Solid island hydrates without
  re-fetching. See M4 + the 2026-06-07 edge-SSR Decision Log entry.

---

## 9. Milestones / Tracker

> Status legend: ⬜ todo · 🟡 in progress · ✅ done

### M0 — Zero-infra reader (GitHub Pages) ✅
- [x] ✅ Astro + Solid shell renders a Markdown page from jsDelivr at the latest SHA.
- [x] ✅ Routing for content pages; graceful "page not found" for new slugs.
- [x] ✅ GitHub Pages deploy workflow (skips rebuild on content-only changes).
- [x] ✅ Verified live: content edit → page updates with **no rebuild** (no workflow run).
- Live: https://mde-pach.github.io/wiki-n-go/ · repo: `mde-pach/wiki-n-go`

### M1 — Wikipedia-friction anonymous editing (core Worker)
- [x] ✅ In-site Markdown editor (Solid island) — `src/components/Editor.tsx`; builds clean.
- [x] ✅ Cloudflare Worker: bot token, `ip_hash`, PR as `anon-<hash>` — `worker/`; typechecks clean.
- [x] ✅ Editor → Worker → PR loop verified end to end (PR authored as `anon-<hash>`).
- [x] ✅ Worker live: `https://wiki-n-go.maxime-depachtere-80f.workers.dev` (secrets + RATE_LIMIT KV bound).
      Setup + deploy is the `/setup` wizard → Deploy-to-Cloudflare button →
      Workers Builds (M9); credentials live on the Worker, KV is Cloudflare-owned.
      Repo + discussion-category IDs derived at runtime; site config injected from
      repo context at build. Fork-and-go needs no file edits.

### M2 — Optional GitHub-login attribution ✅
- [x] ✅ "Sign in with GitHub" → Worker OAuth exchange (`read:user` only). Worker
      mints a stateless HS256 session JWT (no DB, no stored user token); the
      client replays it as a bearer token (cross-origin → not a cookie).
- [x] ✅ Edits attributed to the signed-in identity — commit author = the user's
      GitHub no-reply email (profile link + contribution credit, **no PII**).
      Worker stays the only writer; sign-in just swaps the identity label.
      Signed-in users follow the same trust gate as anon (earn tiers from
      history). Runtime-gated by OAuth env presence — live: `/auth/login`,
      `/auth/callback`, `/auth/status` are wired and `AuthButton` revalidates.

### M3 — Moderation & abuse (essential)
- [x] ✅ `bans.json` at repo root (outside anon-writable `content/`) + Worker 403 on banned `anon-<hash>`.
- [x] ✅ Anon edits never auto-merge — every edit is a PR awaiting manual review (default).
- [x] ✅ Slug hardened: no leading/trailing/double slash, no traversal (Worker `SLUG_RE`).
- [x] ✅ Rate-limiting live: KV fixed-window, 5 edits / 10 min per `anon-<hash>`.
- [x] ✅ Bot check on edits = an **in-browser proof-of-work** (no third-party): the browser mints a `<ts>.<salt>.<nonce>` token whose SHA-256 has `POW_BITS` leading zero bits (default 18); the Worker re-hashes once, checks freshness + single-use (KV), 400 without a token. Replaced Cloudflare Turnstile.

### M4 — Discussion, deploy & polish
- [x] ✅ Anonymous discussion: comments via Worker → GitHub Discussions, stamped `anon-<hash>`
      (replaced giscus, which required a GitHub login). Read is public; posting is proof-of-work + rate-limited.
- [x] ✅ Talk threading: each topic is a titled GitHub Discussion (`talk:<slug> · <title>`); arbitrary-depth
      replies via a `<!-- reply-to:<id> -->` marker rebuilt into a tree client-side. Per-comment reply +
      permalink; reply-count and last-activity in the topic index.
- [x] ✅ Discussion Stage B: signed-in users' topics & comments render under their
      GitHub login + avatar (via a `gh:<login>|<avatar>` body marker; bot still posts). Shares the M2 sign-in.
- [x] ✅ Multi-host deploy buttons (Netlify / Vercel / Cloudflare) in README.
- [x] ✅ (Optional) edge-SSR variant for SEO — an Astro adapter (Cloudflare/Netlify)
      behind `EDGE_SSR`, **off by default** (GitHub Pages static path unchanged). When
      on, **only the content route** renders on demand at the edge (config-only, via an
      `astro:route:setup` hook — no `prerender` export in the page), fetching content +
      slug set + revisions from jsDelivr@sha / the Worker **at request time** (no
      rebuild). Crawlers get real HTML; the revision line, `<meta description>`, OG +
      canonical tags are server-rendered; **`noindex`-until-patrolled is resolved
      server-side** (queries `/patrol-status`, fail-open). The same Solid island
      hydrates with `fresh` (no double-fetch); a missing slug returns a real 404 and a
      `redirect:` page a server-side 301. Verified live with `wrangler pages dev`.

### M4.5 — Wikipedia page features ✅
- [x] ✅ References/footnotes + citation hover tooltips; captioned figures.
- [x] ✅ Frontmatter layer → infobox, categories (chips + `/category/<tag>`), hatnotes, maintenance banners.
- [x] ✅ Per-section `[edit]` links; TOC (desktop + mobile); icons; self-hosted fonts.
- [x] ✅ Reading polish: SSR'd content/revision line + red links resolved before paint (no blink); collapsible
      sections; wikilink **hover page previews**; interwiki `[[w:…]]` links; lead-term emphasis; full-text search.
- [x] ✅ Editing/chrome: draft persistence across reloads; in-site help namespace (`/help`); main-menu nav drawer;
      lazy-loaded **Mermaid** diagrams (`` ```mermaid ``, own chunk, strict security level).
- [x] ✅ P2 polish: **@mention** linkify (`@anon-<hash>` → contributions filter, `@login` → GitHub profile);
      **named-ref reuse** (`[^name]` cited many times → one reflist entry + lettered backlinks a/b/c);
      **citation templates** (`{{cite|url=…|title=…}}` → formatted footnote, `ref=` reuses one entry).

### M5 — Autonomous editing mode (immediate publish + post-hoc moderation) ✅
Invert the default selectively. Critical path (see `FEATURES.md` §§K–N):
- [x] ✅ **Every edit is a PR; trust decides only *when* it merges.** The Worker commits to a **deterministic
      branch per author+slug** (so all of one editor's pending changes to a page share one PR) and opens/reuses that
      PR, then for a qualifying tier **squash-merges it immediately** (the same path a maintainer's manual merge
      takes); below-tier edits wait for review. A PR that won't merge cleanly (a concurrent change touched the same
      lines) is **left open and falls into the review queue** — so git's 3-way merge is the single edit-conflict
      detector for both paths. **Publish is atomic-or-error**: if the merge or its bookkeeping can't complete the
      Worker throws (no half-done "success"), and because the branch is deterministic a **resubmit reconciles** the
      leftover branch/PR instead of stacking a duplicate; a resubmit whose content already matches the live page is
      an **idempotent no-op** that just finishes the bookkeeping. On a clean auto-merge: busts
      `meta:latest-sha`/`meta:pages` cache, patches the index, autopatrols, deletes the branch (live, no rebuild).
      The publish phase **streams progress** to the editor as NDJSON milestones (open PR → publish → go live) for a
      live progress bar; up-front rejections still return a clean HTTP status (the split keeps the contract).
      *(Replaced the earlier direct-commit-to-`main` path — see Decision Log 2026-06-06.)*
- [x] ✅ **Trust tiers** on `ip_hash`, **derived from git history** (not a ledger): count + first-seen of commits the pseudonym authored on the branch → open/auto/extended; `trusted-editors.json` = maintainer. Covers direct commits **and merged PRs** (both are commits by the pseudonym), so PR-only contributors earn trust too — no webhook, single source of truth. KV caches stats (1 h TTL, busted on the author's own commit).
- [x] ✅ Page protection = a `protection:` **frontmatter field** (env default when unset); a privileged page-property, gated per-field on save (can't raise above / lower from above your tier). Replaced `protection.json`+globs. TODO: `expires`, CODEOWNERS.
- [x] ✅ Verified end-to-end: anon edit to an `open` page **auto-merges live** (PR opened then squash-merged); a
      conflicting edit stays an open PR for review; flipping its `protection` rejected 403; protected pages wait for review.
- [x] ~~AbuseFilter-style pre-publish rule pass (`filters.json`)~~ **Removed** (2026-06-08) — pulled out the content filter (`filters.ts`/`filters.json`/`runFilters`); spam handling moves elsewhere. The `tag:<sha>` KV set, RecentChanges badges, and revert-risk scoring stay, now fed only by 3RR's `edit-war` tag.
- [x] ✅ **Revert-risk heuristic** (`worker/src/risk.ts`): a 0–100 score per change from byte deltas + anon +
      page-creation + tags (no extra fetch), surfaced in `/changes` → a **"high risk" badge** + **High-risk-only
      filter** in the console. **3RR**: a per-author-per-page 24 h KV counter (`THREE_RR_MAX`, default 3) flags the
      4th rapid edit `edit-war` (trusted tiers exempt) → review badge + risk bump. Both unit-tested.
- [x] ✅ PR-only contributors earn tiers — solved by deriving from git history (above), no webhook needed.
- [x] ✅ **Automoderator / ClueBot** (`worker/src/automod.ts`): the post-publish safety net (§M step 6). Right after an
      edit auto-merges, if its revert-risk score ≥ `AUTOMOD_REVERT_SCORE` (off unless set) and its author is below
      `AUTOMOD_EXEMPT_TIER`, an `automoderator` bot reverts it via the **shared reversible rollback path** (`revertCommit`,
      extracted from `/rollback` — a normal commit, never a force-push). Guardrails: trusted-tier exemption + a per-page
      24 h `AUTOMOD_REVERT_CAP` (no edit-war). Recorded in `audit-log.jsonl` + an `auto-reverted` tag; recourse via
      re-edit/talk and **one-click maintainer undo** in the `/admin` **Automoderator** view. Pure `decideAutoRevert` +
      the full publish→revert path unit-tested.
- [ ] ⬜ (Optional hardening) `ip_hash` salt/epoch rotation to cap long-term linkability — deferred, not a blocker.

### M6 — Owner admin dashboard & governance ✅
The sysop console for the autonomous model (see `FEATURES.md` §N). Remaining TODOs are
follow-ups (CODEOWNERS sync, hard-purge, revert-risk/3RR), not core console gaps:
- [x] ✅ **Unified `/admin` console** — maintainer-gated sysop dashboard (`src/pages/admin.astro` +
      `Admin.tsx`) with tabs aggregating the existing **Recent changes** + **Pending review** surfaces;
      `noindex`, linked from the footer. The home for every governance action below.
- [x] ✅ RecentChanges feed + **patrol queue** (M5) + **`noindex`-until-patrolled**: a `PatrolMeta` read-view
      island queries Worker `GET /patrol-status?slug=` and adds `robots=noindex` when the page's latest revision
      is unpatrolled. Client-side (the read path is static/CDN) so only JS-running crawlers honor it; **fails open**
      (no KV / Worker blip → indexable), so a hiccup never deindexes the wiki.
- [x] ✅ **Autopatrol** — an edit whose author tier ≥ `AUTOPATROL_TIER` (default `extended`) lands **pre-patrolled**
      (`patrol:<sha>` set on commit), so trusted edits never show unreviewed or get `noindex`; maintainer console
      actions (rollback/restore/protect) auto-patrol their own commits too. Tier-gated, env-tunable.
- [x] ✅ One-click **rollback** + **restore-to-revision** — Worker `POST /rollback` (maintainer) restores every
      page a commit touched to its pre-commit state (deletes pages it created); `POST /restore {slug, rev}` sets one
      page to its content at any past revision (History-row "restore", maintainer-only). Both land as a new,
      reversible revision and bust the content/index cache. TODO: trailing-run rollback.
- [x] ✅ **Blocks + audit log** — Worker `POST /ban` / `POST /unban` edit `bans.json` (maintainer-only,
      committed → git is the record), supporting **path-scoped partial blocks** (`{key, paths}`; enforced by
      threading the edit slug through `isBanned`, so a partial block gags only its subtrees and never a comment).
      Append-only `audit-log.jsonl` records rollback · restore · protect · delete · tag · grant · revoke · ban · unban ·
      suppress · unsuppress · auto-revert. New **Blocks** + **Audit log** tabs in `/admin`
      (`GET /bans`, maintainer-only `GET /audit`). TODO: ban `expires`.
- [x] ✅ **Protection + rights management** — Worker `POST /protect {slug, tier}` rewrites the page's `protection:`
      frontmatter via a targeted line edit (clean diff); `POST /grant`/`/revoke` (+ `GET /editors`) edit
      `trusted-editors.json` to add/remove maintainers (the owner is always one). **Protection** + **Rights** tabs in
      `/admin`, all audited. TODO: CODEOWNERS / GitHub-team sync, protection `expires`, current-protection display.
- [x] 🟡 **Oversight/suppression** — `suppressed.json` entries (author / revision) the Worker **redacts server-side**
      in `/changes` + `/history` (label → `[suppressed]`), so suppressed data never reaches the page. `POST /suppress`/
      `/unsuppress` (+ `GET /suppressed`), **Suppression** tab, audited. Full **hard-purge** (git history rewrite +
      CDN purge) stays a **manual owner op** — the Worker can't rewrite history via the contents API.
- [x] ✅ **New-Pages queue + deletion + Page Curation toolbar** — `/admin` **New pages** tab lists recently created
      pages (from `git log` file-status `added`) with patrol state + a maintainer **delete** (`POST /delete`, audited).
      Deleted pages remain in git history → **undelete = restore a pre-deletion revision** from History (no separate
      endpoint needed). A reusable **`PageCuration`** reviewer overlay (maintainer-gated via `whoami`) triages a page in
      one place — approve (patrol) · **tag** (one-click maintenance tags via `POST /tag`) · message author (→ talk) ·
      contributions · roll back · propose-delete, with patrol state + the revert-risk badge + applied tags inline; it sits
      on each New-pages row **and** on any page's read view, with optimistic UI over the patrol/tag/rollback/delete
      endpoints. `POST /tag` (maintainer-only, audited) read-merges a tag into the same `tag:<sha>` KV set the filter/3RR
      pass writes, so manual + automatic tags share one store and surface identically in RecentChanges.

### M7 — Special pages & content lifecycle ✅
Read-time reports + git-native operations (see `FEATURES.md` §§O–P):
- [x] ✅ **Link graph** (invert `[[links]]` + tags) — built at build time **and served live by the
      Worker** (`/link-graph`, `/search-index`): a per-slug KV index maintained *incrementally* on each
      direct edit (full rebuild only on a cache miss), so it's fresh with no site rebuild; the app prefers
      the Worker and falls back to the static `*.json`.
- [x] ✅ Special pages at `/special`: WhatLinksHere · **PageInfo** · Wanted · Orphaned · Dead-end ·
      **Redirects (broken/double)** · AllPages · **Categories** · MostLinked · Statistics · Random.
      (RecentChanges lives at `/changes`.)
- [x] ✅ **Category system** (`/category/<tag>`, FEATURES §P): the link graph now inverts frontmatter
      `tags` into a `categories` map (live Worker index + static fallback, no rebuild), driving a real
      category page — member listing, **subcategory hierarchy** (a member page that is itself a category
      nests, with a parent breadcrumb), **hidden/maintenance** categories split from topical ones (in the
      footer chips and on the page), and boolean **tag intersection** at `/category/a+b`. Grouping +
      classification is pure (`src/lib/categories.ts`), unit-tested.
- [x] ✅ **Redirects**: `redirect:` frontmatter bounces the reader (`#REDIRECT`) with a "Redirected from"
      note + `?redirect=no` escape; broken/double redirects flagged from the graph.
- [x] ✅ **Move/rename**: Worker `POST /move` copies the page to the new slug and leaves a redirect stub
      at the old one (gated to whoever may edit it); `/move?page=` form, linked from PageInfo.
- [x] ✅ **Short descriptions** (`description:` frontmatter → `<meta description>`, hover-preview text)
      and **permalink-by-revision** (`?rev=<sha>` renders the page from jsDelivr@sha with an
      "old revision" banner; History rows link to it).
- [x] ✅ **Citoid-style auto-cite**: Worker `GET /cite?q=` turns a URL, DOI, or ISBN into a
      footnote-ready Markdown reference — Crossref for DOIs, OpenLibrary for ISBNs, OpenGraph/`<meta>`
      scraping for URLs (the one case that needs the Worker — arbitrary pages aren't CORS-readable
      from the browser; SSRF-guarded, KV-cached). `/cite` builder tool, linked from Special pages.
- [x] ✅ **Creation wizard**: `/new` takes a title → live slug preview, "already exists" guard, and a
      starting template (Article / Guide / Blank), then opens the editor seeded from that template;
      the editor reads "Creating" vs "Editing" for pages that don't exist yet. Linked from Special pages.
- [x] ✅ **Merge/split** (`worker/src/handlers/lifecycle.ts`, `POST /merge` + `/split`): built from the **move
      primitive** (gated direct commits + redirect stub) and gated **like a normal edit** (proof-of-work + bans +
      rate-limit via `resolve()`, trust-tier check on every affected page — insufficient
      tier → 403, as with move). The client composes the page bodies (`src/lib/lifecycle.ts`: `composeMerge` folds
      one page in under a heading + `merged_from:` frontmatter and the Worker leaves a redirect at the source;
      `composeSplit` carves a `##`/`###` section into a new page seeded with `split_from:` + trims the original),
      so the Worker only validates/gates/commits — no new low-level write path. `/merge` + `/split` forms linked
      from **PageInfo** (Special pages) like move. Pure composition + worker endpoints unit-tested.
- [x] ✅ **Named drafts** (`src/lib/draft.ts`, client-side localStorage — same no-DB/no-write-path model as the
      existing scratch autosave): a contributor saves work-in-progress for a page under a name and resumes it later
      without opening a PR. Surfaced as a `DraftList` in the editor (save / this-page drafts / resume / delete; a
      resumed draft is keyed by `?draft=<id>` and deleted once it publishes) **and** on `/new` (resume any saved
      draft). Pure list ops unit-tested.
- [x] ✅ **Reading/editing-surface polish** (FEATURES S8/T6/T7): bumped the base reading size to 16px and
      rescaled the type ladder proportionately (pre-paint tokens, no blink, Appearance text-size steps stay
      distinct); **section-scoped focused editing** — a heading `[edit]` opens a reusable `FocusedEditor`
      *in place* on the read page, splicing the edited section back into the whole document and submitting
      through the **same edit pipeline** (no second write path); and an **edit-page density pass**
      (properties collapsed by default, the publish card → a compact bar, more textarea viewport),
      CSS/structure only.

### M8 — Interlanguage (multilingual articles) ✅
Wikipedia-style "N languages" switcher — the **same article in several
languages**, all hosted in our repo (distinct from interwiki links *out* to
Wikipedia, `FEATURES.md` S5/W3). A translation is **a fully independent page**
(its own localized slug, content, git history, talk, edit — all free from
slug-keying); languages are tied together by a **low-cost link**, not a shared
page identity. URL shape and the linking mechanism are **independent choices**.
- [x] ✅ **v1 shipped** (`66e0eca`): `defaultLang` + supported `languages` config,
  `langOf()`, `translationKey` frontmatter, build-time grouping (`src/lib/i18n.ts`),
  and an SSR `<details>` switcher + per-page `<html lang>` + `hreflang` in `PageShell`
  — all server-rendered, no blink. Demo: `content/fr/demarrer.md` ↔ `getting-started`.
- **Default language is configured + languageless.** A `defaultLang` config (e.g.
  `en`) is the missing spot: default-language pages keep **bare, unprefixed slugs**
  (`/coffee`, `/getting-started`, `/`) — so existing content needs **no migration**.
- **Other languages are URL-prefixed, with their own localized slug:**
  `/<lang>/<localized-slug>` (`/fr/cafe`), file `content/<lang>/…`. Segment 0 in
  the reserved ISO-639-1 set ⇒ that's the page's language; otherwise `defaultLang`.
- **Routing stays cheap:** language is just part of the slug, so view prefixes
  (`/edit/fr/cafe`, `/history/…`, `/talk/…`) need no `parseRoute` view change. New:
  a `langOf(slug)` helper; `<html lang>` ← it; `<link rel="alternate" hreflang>` per sibling.
- **The link (low-cost):** every member carries a frontmatter **`translationKey`**
  — a free-form group id, by convention the default-language slug but **not required
  to match any existing page**. The existing build/Worker index inverts it into
  groups (same shape as `[[links]]`/`redirect`); the switcher renders the group
  server-side (no blink). Adding a language = create one page carrying the key. A
  **uniform, symmetric** key (on every member, including the default) means no
  canonical-must-exist rule and no special-casing.
- **Default-language version is optional.** An article may exist only in non-default
  languages (e.g. just `fr`+`de`). Then the bare languageless slug simply doesn't
  resolve until someone creates the default version; the group still forms from
  whoever shares the key, and the absent default surfaces as a "translate this page"
  affordance (P2). This is *why* the link is a symmetric key, not a pointer to a canonical page.
- [x] ✅ **v2 shipped** — **language-aware wikilinks** (`resolveWikiSlug`: a French
  page's `[[Café]]` → `fr/cafe`, else the default article, else a red link to create
  it in French; resolved at build + reconciled client-side); **per-language home**
  (`/fr` → `content/fr/index.md`); **live grouping** (`translationKey` now in the
  Worker index → `LinkGraph.translations`, so the switcher — a `LangBar` island —
  reflects translations created with no rebuild); **"translate this page"** (missing
  configured languages show a create link that seeds `translationKey` in the editor).
- [ ] ⬜ Future polish (P2): localized create-slug picker (v2 seeds `<lang>/<key>`,
  rename via move); `@mention`-style language badges; existence-checked interwiki (S5).

### M9 — Low-click setup (no PAT, no token juggling) ✅
**One** setup path, collapsing adoption from "wire ~5 secrets in CI" to a few
clicks: the `/setup` wizard → **Deploy to Cloudflare** button. The GitHub-Actions
worker-deploy path (`deploy-worker.yml`, CF API token + PAT) is **retired** — a
single way, not two. See §5.
- [x] ✅ **GitHub App credential** (`worker/src/githubApp.ts`): `ghToken()` mints
  short-lived, repo-scoped installation tokens (RS256 App JWT → installation-id
  derived from the repo → `/access_tokens`, cached to ~1 min before expiry).
  Prefers the App when `GITHUB_APP_ID`+`GITHUB_APP_PRIVATE_KEY` are set, falls back
  to the `GITHUB_TOKEN` PAT — backward-compatible. Accepts GitHub's PKCS#1 key by
  wrapping it to PKCS#8 in-worker (no `openssl` for the user). Unit-tested.
- [x] ✅ **Client-side `/setup` wizard** (`src/pages/setup.astro` + `Setup.tsx`,
  `src/lib/setup.ts`): GitHub App **manifest flow** end to end in the browser —
  create app (pre-filled, write-only scopes, no webhooks) → exchange the one-time
  code for id+key client-side (conversions endpoint is CORS-`*`) → show id, key,
  and a generated `HASH_SECRET` → **Deploy to Cloudflare** → install + `WORKER_URL`.
  Verified: config, loading, error, and credentials states render.
- [x] ✅ **Deploy = Cloudflare Workers Builds** (set up by the button): provisions
  the Worker + KV from the `worker/` subdir and **auto-redeploys on every push to
  the production branch**. Secrets (App key, `HASH_SECRET`) and the KV binding live
  in Cloudflare, not the repo. **Upstream worker fix → user merges it into `main` →
  Cloudflare redeploys automatically**, reusing the same secrets + KV — no per-fix
  step, no secret re-entry, same KV instance across updates. KV id dropped from
  `wrangler.toml` (Cloudflare owns/persists it; KV is cache-only anyway).
- [x] ✅ **Shared hosted instance (multi-tenant)** — one operator-run Worker + App
  serving any repo that installs it (giscus model), so adopters skip even the
  self-host click. `MULTI_TENANT` flips it on: the target repo is derived from the
  request (`X-Wiki-Repo` header / `?repo=`), validated against the App's installs
  (`repoInstallationId`, cached), and **KV is namespaced per repo** by wrapping the
  binding (`namespacedKV` in `worker/src/tenant.ts`) so every key — rate-limit,
  trust, link-graph/index, tags, patrol, 3RR, change, cite, contributions,
  discussion-ctx — is prefixed `r:<owner>/<repo>:` with no per-call-site audit;
  **bans/trusted-editors/audit/content are repo files**, so the repo override alone
  namespaces them. The App installation token cache is now keyed per repo (was a
  single global), and `ip_hash` is repo-salted on shared instances so a pseudonym
  can't be linked across tenants. Single-tenant stays the default and **ignores**
  any request repo (a pinned Worker can't be redirected). Unit + integration tests
  cover the isolation (a tenant can't read/clobber another's KV or bans).
  **Privacy invariant holds** (and is noted in §6): only `ip_hash` is committed; the
  operator sees the raw IP only *transiently*, in-Worker, before hashing — same as
  the self-hosted path, just run by the operator for many repos.

### M10 — Federated identity: the Wikigit account (centralised, GitHub-optional) 🟡
Add a **third identity tier** so people without GitHub can attribute edits via a
centralised **Wikigit account**, and split the platform into clear projects so the
Engine's no-DB invariant survives. Today identity is anon `ip_hash` (primary) +
GitHub `gh:<login>` (optional). New: **Wikigit `wg:<handle>`** (optional, GitHub-free).
The bot (App installation token) stays the **only writer** — a signed-in identity only
swaps the commit-author *label* + trust *key*, so a Wikigit account needs **no repo
write access and no GitHub account**. `Writer` (`worker/src/identity.ts`) already
generalises: add `wikigitWriter(session)`, key `wg:<handle>`, beside the two it has.

**Three deployables — the 3 distributions map to 3 projects:**

| Project | Identity role | DB | Distributions it serves |
|---|---|---|---|
| **Wikigit Engine** (this repo) | **OIDC relying party** — consumes GitHub + any configured Wikigit issuer; stores no accounts | **No** (invariant holds) | the dogfood "wikigit of wikigit" **and** every self-hosted instance — both are plain Engine deploys |
| **Wikigit Accounts** (**self-hosted OpenAuth**) | a tiny Bun app (`accounts/`) running [OpenAuth](https://openauth.js.org): passwordless email **code**, file-persisted store, **SMTP** (self-hosted Stalwart, `no_reply@wikigit.org`) — identity only, nothing else | **Yes** (file-persisted store on a volume, external to the Engine) | issues "Sign in with Wikigit"; self-host via `issuer` config |
| **Wikigit Hub** (new, ours) | tenant console: create/manage your wikigit; auth via Accounts | uses Accounts | "the main wikigit instance" product surface |

- **The no-DB / single-Worker invariant binds the *Engine*, not the platform.** Accounts
  and Hub are *separate* services with their own store **precisely so** the Engine stays
  one Worker, no DB. The deployable wiki never grows a database; the account system that
  needs one lives outside it.
- **Accounts is a tiny *self-hosted OpenAuth* Worker, not an off-the-shelf IAM.** Scoped to
  identity + magic-link only, a ~100-line [OpenAuth](https://openauth.js.org) issuer
  (`accounts/`) is far lighter than a full platform — **Logto/Zitadel were overkill** for
  "nothing but identity + magic link". OpenAuth flow + account records live in a
  **file-persisted store** (no relational DB). A self-hoster points the Engine's `issuer`
  at their own deployment; we ship the Bun app.
- **Runs on Bun (Coolify), not Cloudflare Workers.** OpenAuth generates an RSA encryption
  keypair at startup (~97ms), which exceeds the Workers free-tier 10ms-CPU cap → 503 on
  `/authorize`. Repackaged as a Bun app on Coolify (full CPU); the Engine is unchanged.
- **Passwordless: an emailed code** (OpenAuth's `CodeProvider`/`CodeUI`), delivered over
  **SMTP** from a self-hosted Stalwart server as `no_reply@wikigit.org` (STARTTLS on
  `smtp.dooz.qawa.app:587`); no password, no passkey in v1. GitHub can later be added as an OpenAuth provider so a Wikigit account
  **links** a GitHub identity (one human, one `wg:` id, one trust history); until then the
  Engine's direct GitHub OAuth stays the GitHub path.
- **No signup trust bonus (Sybil gate).** A fresh `wg:` account starts at the
  anon-equivalent tier and earns trust only from real merged edits, **per-repo** (the
  account is a stable global *label*, not a global trust score); real power stays
  human-granted, matching the existing auto-tier stance.
- **Moderation carries over for free.** `bans.json`, rate limits and suppression already
  key off `writer.key`, so `wg:<handle>` slots in with no new moderation surface.
- **Profiles unlock for non-GitHub users.** A Wikigit account is the durable identity
  behind profile pages / watchlist / notifications (FEATURES §Q, U3) — the account-path
  features stop being GitHub-only.

Build order (each ships independently; the Engine slice lands here first):
- [x] ✅ **Engine — pluggable consumer + OpenAuth client.** Identity consolidated under
  `worker/src/identity/`; sign-in generalised to a provider registry (`providers.ts`:
  GitHub OAuth2 + Wikigit via a standard `/authorize`+signed-state, then OpenAuth-client
  `exchange` + JWKS `verify`, both lazy-imported so OpenAuth stays out of the base bundle).
  `authLogin`/`authCallback` dispatch by `?provider=` over a shared `/auth/callback`;
  `authStatus` reports per-provider. `wikigitWriter` keys `wg:` + the no-PII author off the
  stable `sub` (handle is display only); `resolve()` branches via a pure, unit-tested
  `writerFor`. Frontend: "Sign in with Wikigit" beside GitHub. Public client — **no secret**;
  **inert** until `WIKIGIT_ISSUER` + `WIKIGIT_CLIENT_ID` are set. No DB, no new service in the Engine.
- [x] ✅ **Accounts — OpenAuth Bun app (`accounts/`), deployed & live at `auth.wikigit.org`.**
  `CodeProvider`/`CodeUI` email code, `MemoryStorage({persist})` file store, subjects
  `{id,email,handle}`, redirect allowlist (`*.wikigit.org` + localhost). Runs on Coolify
  (Bun, not Workers — see CPU note above); SMTP via self-hosted Stalwart as
  `no_reply@wikigit.org`. End-to-end verified 2026-06-08: `/authorize` → code form → emailed
  code delivered. **Follow-up:** mount a persistent `/data` volume + `STORE_PATH` so OpenAuth's
  signing/encryption keys survive restarts (today they regenerate per boot, invalidating
  in-flight sign-ins).
- [ ] ⬜ **Hub — tenant console** on top of M9's shipped multi-tenant Worker (create/manage
  instances); auth via Accounts.
- [ ] ⬜ **Wire dogfood + main instance** to the canonical IdP; expose the self-host `issuer` override in config.

Open: `wg:` handle namespace + uniqueness (the Engine keys `wg:` off the stable `sub`
meanwhile); persistent key volume for Accounts (see follow-up above).

### M11 — Portable backend (Bun server, no-DB, self-hostable) 🟡
Move the Engine backend **off the single Cloudflare Worker** onto a **portable Bun
server** that wikigit.org runs centrally (multi-tenant, free for end users) and
anyone can self-host. Cloudflare stays *possible* (one optional host), not the
built-in. The read path (jsDelivr@sha + static islands) is unchanged — only the
editing/dynamic backend moves. Full design + migration plan:
`analysis/11-portable-backend-plan.md`. Decisions (2026-06-14):
- **Bun server**, one process (the `accounts/` template), not edge functions.
- **No DB — memory + git.** Sessions/OAuth-state/PoW are signature-based (survive
  restart, no store); rate-limit/PoW-single-use/3RR + trust/index/cite are
  ephemeral in-memory behind the existing `namespacedKV` seam (rebuilt from git on
  miss); durable moderation state stays in git.
- **Backend only** — content stays in each user's GitHub repo, read via CDN; the
  server relays writes + serves dynamic endpoints.
- **Self-host = a Bun binary** (`bun run start`) + reverse proxy for TLS.
- **Durable patrol/tags move to `.wikigit/moderation.jsonl`** (git append-log,
  hydrated to memory on boot — the `audit-log.jsonl` pattern), since they aren't
  derivable from content.
- **Scale vertical-first**, then **shard by tenant** (`repo → process`) if needed —
  keeps no-DB correctness without a shared store.
- [ ] ⬜ M11.1 store `Store` interface + `MemoryKV` · M11.2 Bun runtime (`Bun.serve`
  wrap, `waitUntil`→tracked fire-and-forget) · M11.3 moderation log · M11.4 frontend
  `serverUrl` · M11.5 deploy/ops · M11.6 retire CF surface (setup wizard, `wrangler.toml`,
  KV, `EDGE_SSR=cloudflare`; PKCE-watch dropped).

The §5 "one piece of infra is irreducible" argument is **runtime-agnostic** — it
holds for the Bun server exactly as for the Worker (the browser still can't hold a
write credential); only the noun changes.

---

## 10. Open Decisions

- [x] ~~Rate-limiting mechanism~~ → **KV fixed-window** (5 / 10 min per source).
- [ ] **`ip_hash` input:** full IP vs. coarsened (`/24` / geo) for extra safety.
- [ ] **Auto-merge policy:** which (if any) signed-in contributors bypass review.
- [x] ~~SHA resolution~~ → **Worker `/latest`** (KV-cached ~20s, authed quota) with
      GitHub-API fallback; `no-store` so the browser never pins a stale SHA.
- [x] ~~SSR-edge variant~~ → **shipped, opt-in via `EDGE_SSR`** (Cloudflare/Netlify);
      content route on demand, server-side `noindex`, no rebuild. Off by default —
      **on for the flagship CF Pages deploy** (`EDGE_SSR=cloudflare`) so its first
      paint is request-time-fresh; forks/GitHub Pages stay static.
- [x] ~~**PKCE watch:** drop the OAuth half of the Worker once GitHub supports
      client-side PKCE~~ → **moot (M11)**. A portable Bun server holds the OAuth
      client secret fine, so there's nothing to wait on; the OAuth half stays
      server-side by design.
- [x] ~~`gh:` ↔ `wg:` identity merge (M10)~~ → **link** (one identity; GitHub a connector on the IdP).
- [x] ~~Account-signup abuse (M10)~~ → **no signup trust bonus**; trust earned per-repo, real power human-granted.
- [x] ~~IdP pick (M10): Logto vs Zitadel~~ → **self-hosted OpenAuth Worker** (lighter; identity + email code only).
- [x] ~~Magic-link email provider (M10)~~ → **SMTP from self-hosted Stalwart** (`no_reply@wikigit.org`), nodemailer in the Bun app. *(Was Cloudflare Email Sending; dropped with the Workers→Coolify pivot.)*
- [x] ~~Interlanguage link shape (M8)~~ → **symmetric `translationKey`** on every
      member (default-language version optional; an article may exist only in non-default langs).
- [ ] **Language-aware wikilinks (M8):** whether `[[Café]]` on a French page
      prefers `fr/…`; v1 keeps wikilinks language-agnostic.

### Resolved
- ✅ **Framework:** Astro (static output) + Solid islands.
- ✅ **Editing UX:** in-site editor; anonymous-primary at Wikipedia friction.
- ✅ **Hosting:** multi-host click-to-deploy; GitHub Pages first.

---

## 11. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-04 | Compose GitHub subsystems instead of self-hosting | Minimizes infra to ~1 Worker |
| 2026-06-04 | Repo/Discussions/Actions = database; site = interface | Headless; editing stays in-site |
| 2026-06-04 | **Anonymous editing is the primary path** (Wikipedia friction) | No account/token required to edit |
| 2026-06-04 | GitHub sign-in is optional (attribution only) | Credit without forcing accounts |
| 2026-06-04 | **One Worker is irreducible** for anonymous writes | Browser can't hold a bot credential or ride the GitHub session |
| 2026-06-04 | Drop BYO-PAT and "Edit on GitHub" link-out | Both fail the Wikipedia-friction bar |
| 2026-06-04 | Anonymous identity = derived `ip_hash`, never stored; no raw PII in repo | Avoids unredactable PII in immutable history |
| 2026-06-04 | Reads via jsDelivr pinned to commit SHA | No rebuild + instant + free CDN, no purge |
| 2026-06-04 | App = Astro (static) + Solid islands, client-render content | No rebuild, not a heavy SPA, good static portability |
| 2026-06-04 | Multi-host click-to-deploy; GitHub Pages first | Read phase needs no infra; portable |
| 2026-06-04 | Avoid Vercel Hobby (non-commercial only) | Prefer Cloudflare / GitHub Pages / Netlify |
| 2026-06-05 | Drop giscus for discussion; build anonymous comments on the Worker | giscus required a GitHub login — broke the no-account principle |
| 2026-06-05 | Talk topic = one titled Discussion; arbitrary-depth replies via a reply-to marker rebuilt client-side | GitHub Discussions nest only one level; markers give Wikipedia-style threads without a DB |
| 2026-06-05 | Page metadata via YAML **frontmatter** (infobox, tags, hatnote, banner, short-desc) | One declarative source per page; renders at runtime, no rebuild |
| 2026-06-05 | Adopt Wikipedia's **immediate-publish + post-hoc moderation** as a planned mode (not just reviewed-PR) | Reviewed-PR is Wikipedia's *exception*; autonomy needs the inverted default (M5) |
| 2026-06-05 | Autonomy = **`ip_hash` trust tiers** + per-path `protection.json`/CODEOWNERS, not a global switch | Mirrors autoconfirmed/Pending-Changes; keeps review selective; highest-leverage piece |
| 2026-06-05 | **`ip_hash`-only privacy is an invariant, accepted to forgo CheckUser/range-block** | No raw IP exists to reveal — stronger than WP's Temporary Accounts; lean on PR review + rate limits |
| 2026-06-05 | Owner **admin dashboard** = the sysop console (bans, protection, patrol, rollback, audit, suppression) | Centralizes moderation actions that don't flow through a normal PR (M6) |
| 2026-06-05 | Lean on **git for free**: undelete, move/merge attribution, logs, permalinks, export | Git dissolves Wikipedia's hardest admin chores — expose, don't reimplement |
| 2026-06-05 | Page protection = a `protection:` frontmatter field, not a central `protection.json` | Keeps the page URL stable, edits in-site like content, no glob upkeep; first of a per-field-permissioned **page-property** scheme |
| 2026-06-05 | Trust tiers **derived from git history**, not a KV ledger or a merge webhook | Direct commits and merged PRs both land as commits by the pseudonym → one source of truth, PR-only contributors earn trust, no webhook/state to drift (KV is just a cache) |
| 2026-06-05 | One worktree per session; enforced in CLAUDE.md | Parallel Claude sessions share the checkout and collided; isolate each on its own branch |
| 2026-06-06 | Link graph + search index served **live by the Worker** (KV, patched per edit), not only a build-time file | The build-time `*.json` went stale on live edits; the Worker is the only writer, so it updates the index per commit (no rebuild). Static file kept as a no-Worker fallback |
| 2026-06-06 | M6 starts with a **unified `/admin` console** aggregating existing moderation surfaces (M5 RecentChanges + Pending review), then grows new actions into it | §N calls the sysop console the P0 keystone; the moderation surfaces already existed but were scattered, so a single maintainer-gated home is the highest-leverage first slice |
| 2026-06-06 | **Rollback** restores each touched page to its pre-commit state as a *new* commit (no force-push / history rewrite) | Keeps the no-rebuild + immutable-history invariants — a rollback is itself a revision, so it can be rolled forward; overwrites intervening edits (git retains them) and the dashboard confirms first |
| 2026-06-06 | **Blocks edit `bans.json` directly** (committed); partial blocks are `{key, paths}` entries; the **audit log is `audit-log.jsonl`** in the repo, not KV | git is the tamper-evident record (who/when in the commit) and the no-second-store invariant holds; bare site-wide bans still round-trip as plain strings, so hand-edited `bans.json` keeps working. Partial blocks enforce by threading the edit slug into `isBanned` — comments carry no path, so a partial block can't gag talk |
| 2026-06-06 | **`noindex`-until-patrolled is client-side + fail-open**, not server-rendered | The read path is static/CDN with no Worker in front (no SSR yet), so the page can't know patrol state at build; a small read-view island sets `robots=noindex` from `GET /patrol-status`. JS-running crawlers honor it; failing open means a Worker/KV blip never deindexes the wiki. **Revisited 2026-06-07:** the optional edge-SSR variant now resolves this server-side (real `robots=noindex` in the head, still fail-open); this client island remains the path for the static GitHub Pages host |
| 2026-06-06 | **restore-to-revision and protection edits are maintainer-only direct commits**, reusing the rollback path | Consistent with rollback (privileged, no Turnstile, lands as a reversible revision); avoids routing a History/console action through the full anon edit+Turnstile flow. Normal-editor undo (gated like a regular edit) can come later |
| 2026-06-06 | **Page protection set by a targeted frontmatter line edit**, not a YAML reparse-and-redump | Preserves the rest of the frontmatter + body byte-for-byte → clean diffs; the `protection:` field is a simple scalar, so a line replace/insert/remove is safe and unit-tested |
| 2026-06-06 | **Autopatrol is tier-gated** (`AUTOPATROL_TIER`, default `extended`), set on the commit — not a separate human-granted right | Trusted edits shouldn't clog the patrol queue or get `noindex`'d; deriving from the existing tier scale (no new grant/state) keeps one source of truth. Kept modest by default since auto tiers are IP-gameable — real power still needs a human-granted maintainer slot |
| 2026-06-06 | **Deletion is an ordinary file-delete commit; undeletion = restore a pre-deletion revision** (no separate undelete endpoint, no tombstone) | Git already retains deleted content + the path's history, so "undelete" is just the existing restore-to-revision from History — one mechanism, no dead-letter store. New-pages queue derives "created" from commit file-status `added`, no extra index |
| 2026-06-06 | **Rights = editing `trusted-editors.json`** from the console (`/grant`/`/revoke`), not GitHub-team/CODEOWNERS API calls | The maintainer allowlist already drives `editorTier`; editing it is one committed file (git is the record, audited) and needs no extra token scope. GitHub-team/CODEOWNERS sync is a later add-on, not the primitive |
| 2026-06-06 | **Suppression redacts server-side at read time; hard-purge stays a manual owner op** | The Worker redacts author/revision labels in `/changes`+`/history` before they leave it (stronger than client-side hiding — suppressed text never reaches page source), but it **cannot rewrite git history** via the contents API, so true purge (history rewrite + CDN purge + source PR/Discussion delete) is documented as a manual owner procedure — the one place the no-rebuild model bends |
| 2026-06-06 | **Revert-risk is a read-time heuristic from data already on each change**, not a score stored per commit; **3RR is a tag, not a block** | Computing risk at read time (byte deltas + anon + tags) covers direct *and* PR-merged commits without the keying problem of storing `risk:<sha>` at edit time, and needs no extra fetch. 3RR flags `edit-war` rather than throttling because legit rapid edits happen — the risk score + patrol queue triage it. Both leave room for an ML model / link-churn upgrade later |
| 2026-06-06 | Interlanguage (M8): translations are **independent pages** linked by a **symmetric, uniform frontmatter `translationKey`** (every member carries it; default-language version **optional**); **default language is configured + languageless** (bare slugs, no migration), other languages are URL-prefixed + localized (`/fr/cafe`) | Different slug/content per language ⇒ separate pages; a symmetric key (not a pointer to a canonical page) lets an article exist only in non-default languages; key-link is cheap and on-pattern (like `redirect:`); languageless default avoids migration; URL shape and link mechanism are independent choices |
| 2026-06-06 | M4.5 P2 syntax: **@mention** = `@anon-<hash>` / `@<github-login>` (bare `@`, no brackets); **citations** = `{{cite\|key=value\|…}}` (MediaWiki-style double-brace); both are **markdown-it inline rules**, citations reuse the footnote plugin's machinery | A bare `@handle` matches the universal social convention and GitHub's own login grammar (so anon-hashes and logins share one rule, classified by an `anon-` prefix); `{{cite\|…}}` mirrors Wikipedia's template syntax editors expect. Inline rules (not regex over rendered HTML) means code spans / emails / fenced blocks are skipped for free, and routing `{{cite}}` through `markdown-it-footnote`'s env gives shared `[n]` numbering, reuse, backlinks, and hover tooltips with no parallel reference system |
| 2026-06-06 | **Transclusion** = `{{slug}}` on its own line (block-level); the body is fetched from the CDN and inlined **client-side at read time**, not at build or via the Worker | Keeps the no-rebuild invariant — a transcluded page changing doesn't rebuild its includers (same jsDelivr@SHA model as the page itself) — and needs no Worker round-trip. Block-only avoids ambiguity with the inline `{{cite\|…}}` template (a `\|` or leading `cite` opts out). Bounded recursion + DOM-ancestry cycle detection stop a bad include from looping. Params / `{{subst:}}` deferred |
| 2026-06-06 | **Mermaid** is the first markdown plugin admitted as a dependency, but **dynamically imported** (own chunk, loaded only on pages with a `` ```mermaid `` block) and run at **strict security level** | Diagrams are high-value for a technical wiki, but the engine is ~135 kB gzip — lazy-loading keeps it off the base bundle (read-path stays light), and diagram source is user-editable content, so strict (sanitizing) mode is mandatory. The fence degrades to a code block without JS |
| 2026-06-06 | **Unify the write path: every edit is a PR; "trusted" just auto-merges it now instead of waiting for review.** Reverses the M5 direct-commit-to-`main` path (and retires the short-lived base-SHA conflict check that briefly preceded it) | One code path for trusted and untrusted edits, and **git's 3-way merge becomes the single edit-conflict detector** — strictly better than a base-SHA compare (it auto-resolves *non-overlapping* concurrent edits and only conflicts on overlapping hunks) and it covers the new-page add/add race for free. Conflicts **degrade gracefully**: an un-auto-mergeable PR is left open and lands in the existing review queue rather than bouncing the contributor. Cost accepted: ~4–5 GitHub calls per publish vs. one, and GitHub's async mergeability can occasionally defer a clean edit to review (safe degradation; pre-release). Aligns with the FEATURES §K "direct-commit / **auto-merge**" north star |
| 2026-06-06 | **Publish is atomic-or-error + idempotent, keyed on a deterministic `<author>/<slug>` branch** (one PR per author per page; slug slashes kept so branches can't collide) | GitHub's branch/commit/PR/merge calls aren't transactional, so "atomic" means: present a binary success/error and make a **resubmit converge** rather than report a half-done publish as success. A failed step throws; the next submit finds the same branch/PR and reconciles it (no duplicate PRs), and a submit whose content already equals the live page is an idempotent no-op that just finishes any unfinished bookkeeping. Grouping an author's edits to a page into one PR is also the natural unit — a new edit supersedes their still-pending proposal instead of forking a parallel one |
| 2026-06-06 | **`/edit` streams the publish phase as NDJSON progress events; rejections stay up front as clean HTTP statuses.** `proposeEdit` split into `prepareEdit` (validation/ban/filter/no-op — normal JSON + status) and a streamed `runPublish` (open PR → merge → finish, emitting milestones) | A single opaque request can't show a client real progress, so the publish steps stream and the editor renders a live bar. Streaming forces success/failure *in-band* (HTTP is 200 once the stream starts), so we split: anything that can fail up front (`400/403/413/422`, and the fast no-op) is decided **before** streaming and keeps its HTTP status — only a rare mid-publish GitHub failure lands in-band as `{type:"error",status}`. The client falls back to `readJson` whenever the response isn't `ndjson` (rejections + no-op), so one `submitEdit` covers both shapes |
| 2026-06-06 | Revision page (V1): **compare-any-two via per-row older/newer radios + a "Compare selected" button**, kept alongside the per-row cur/prev quick links; the diff gains an add/remove **legend** and a **permalink footer** behind new *optional* `DiffView` props | The side-by-side `DiffView` already existed; V1 finishes the half-wired UI (the `.rev-radios`/`.diff-legend`/`.diff-foot` CSS was present but unused). Radios are Wikipedia-faithful and reuse the existing `/diff?base&head` endpoint with no Worker change; new props default to off so `ReviewQueue`'s `DiffView` usage is unchanged. Diff is computed client-side from the unified patch (`src/lib/diff.ts`, now unit-tested), so no rebuild and no extra Worker work |
| 2026-06-06 | **Pre-submit diff preview is computed client-side** from the two full texts (`diffLines`, an LCS line-diff), not by asking the Worker for a patch | The edit isn't a commit yet, so there's no SHA range for `/diff` — and the editor already holds both the loaded original and the assembled new doc, so an in-browser LCS reuses the same `DLine[]`/`DiffView` pipeline with zero Worker calls. Long unchanged runs collapse to a `⋯ N unchanged lines ⋯` separator so the dialog stays readable; the diff is memoised behind `modal()` so it costs nothing per keystroke |
| 2026-06-06 | **Undo for non-maintainers = open the editor seeded with that revision (`?revert=<sha>`) and submit through the normal edit flow**, not a privileged instant write | Reuses the whole edit pipeline (trust gate, Turnstile, conflict check, the new diff preview) with **no Worker change** — `original()` stays the *current* page so the preview shows exactly what the revert removes/adds, while the reverted content fills the editor. Goes through review/trust like any anon edit (an anon revert of vandalism may queue rather than land instantly — accepted; maintainers keep the instant `restore`). Semantics match the spec's "resubmit prior content": reverting to the prior row undoes the latest edit |
| 2026-06-06 | Diff polish: **collapse markers carry their elided lines** (`DLine.hidden`) so DiffView can expand them in place; collapsing is a view concern, not a re-fetch | The full text is already in hand for `diffLines` (editor preview), so stashing the skipped lines on the marker lets either diff mode reveal them with one click and no Worker round-trip — git's own `@@` hunks simply carry no `hidden`, so History diffs are unaffected. The field is optional/additive, so `parseDiff` and existing `DiffView` callers are untouched. Copy-permalink and ↑/↓/Enter row nav are local view state with graceful fallbacks (clipboard denial is swallowed; key nav defers to focused child controls) |
| 2026-06-06 | **Write credential = a GitHub App installation token, not a bot PAT** (PAT kept as fallback) | The App mints short-lived, repo-scoped tokens on demand (`githubApp.ts`) — nothing long-lived in env to leak or rotate, scoped to exactly contents+PRs+discussions, and the per-repo scoping is what a future shared multi-tenant instance needs. `ghToken()` prefers the App, falls back to `GITHUB_TOKEN`, so existing deploys keep working. GitHub's PKCS#1 key is wrapped to PKCS#8 in-worker so the user pastes it as-is (no `openssl`) |
| 2026-06-06 | **Setup is a 100% client-side `/setup` wizard** (GitHub App *manifest flow*), not a backend onboarding service | The manifest conversions endpoint is CORS-`*`, so the browser can create the App and retrieve its private key with no setup-time backend — dissolving the chicken-and-egg (no Worker exists yet at setup). Wizard then hands off to a **Deploy-to-Cloudflare** click (auto-provisions Worker + KV) + app install. Drops setup from ~5 CI secrets to a few clicks, no PAT, no Cloudflare API token. KV id removed from `wrangler.toml` (auto-provision; cache-only) to stay fork-portable |
| 2026-06-06 | **One setup path only: the wizard → Deploy-to-Cloudflare button → Workers Builds. Retired the GitHub-Actions worker deploy (`deploy-worker.yml`, CF API token + PAT).** | A single creation way, not two parallel ones to document and keep in sync. The button-wired **Workers Builds** auto-redeploys on every push to the production branch, so when upstream ships a worker fix (feature or security) the fork just **merges it into `main` and Cloudflare redeploys automatically** — reusing the same secrets + KV, which live in Cloudflare, not the repo (a merge never touches them). The old CI path couldn't do this cleanly: secrets sat in GitHub, and its auto-provisioned KV id wasn't committed back, so the bound KV instance could drift across deploys. Cost: the canonical worker now redeploys via Workers Builds / manual `wrangler deploy` instead of Actions |
| 2026-06-06 | Vector-2022 chrome (W2): the **Appearance control stays the right-rail sidebar panel**, not an entry in the tab strip; the tab strip splits into **namespace tabs (Article·Discussion) + view/tool actions (Read·Edit·History·Tools)**, with **Tools a native `<details>` dropdown** | Real Vector 2022 puts appearance in the right sidebar (which we already had as `col-info`), so moving it into the row would be *less* faithful and would gut the S7-tuned 3-column read grid for no gain — keep it where Vector keeps it. Tools as a native `<details>` is server-rendered and JS-free (honours the no-blink R1/R4 rules) with zero new island. On mobile the two groups **wrap to stacked rows instead of horizontal-scrolling** — scrolling set `overflow-x:auto`, which forces `overflow-y:auto` and clipped the dropdown |
| 2026-06-07 | **Automoderator auto-reverts only at a high, opt-in threshold (default OFF; ~80 when enabled), and backs off after a per-page revert cap** | The revert-risk score already surfaces a "high risk" badge at 50 for *human* triage; an **unreviewed bot auto-revert is a stronger action**, so it (a) stays **OFF unless `AUTOMOD_REVERT_SCORE` is set** — no fork gets surprise auto-reverts — and (b) when enabled runs **well above 50** (~80) to stay high-precision like ClueBot, leaving the 50–79 band for humans. The `AUTOMOD_REVERT_CAP` (per-page, 24 h, default 3) is the **anti-edit-war guardrail**: the bot reverts a given page at most N times before leaving it for review, so a determined re-adder can't ping-pong the bot indefinitely. Trusted tiers (≥ `AUTOMOD_EXEMPT_TIER`, default `auto`) are exempt, matching where abuse concentrates |
| 2026-06-07 | **Auto-revert reuses the existing rollback primitive (`revertCommit`), not a new write path; recourse = audit entry + public tag + one-click maintainer undo (no auto-opened Discussion)** | Extracting the rollback loop into a shared `revertCommit` means a bot revert is *byte-identical* to a maintainer's manual rollback — a normal **reversible commit**, never a force-push or history rewrite (invariants hold), and no second code path to keep safe. For false-positive recourse we chose the **audit-log entry + a public `auto-reverted` tag + an informative revert commit message** (re-edit or raise on talk) over auto-opening a Discussion per revert: it adds no Discussion spam, stays within "no second store", and the **/admin Automoderator view's one-click undo is just `rollback` of the bot's revert commit** (which replays the contributor's version — no new endpoint, since the revert commit's parent *is* the contributor's edit) |
| 2026-06-07 | **Profile pages (FEATURES U3) are GitHub-signed-in only; anonymous `anon-<hash>` ids get no editable user page** | An editable user page implies *ownership*, but our anonymous identity is a derived `ip_hash` that **cannot prove control of a page** (no account, stateless). So `/user/<login>` resolves a profile only for a durable GitHub identity; an `anon-<hash>` (or empty) id shows a soft "no profile" note that points at its existing `/changes?author=` contributions filter (M4.5) — which stays untouched. The `@login` mention now resolves **in-site** to `/user/<login>` instead of github.com |
| 2026-06-07 | **Multi-tenant isolation = wrap the KV binding with a per-repo prefix + override REPO_OWNER/REPO_NAME per request; single-tenant ignores the request repo** | Namespacing at the *binding* (`namespacedKV`, prefix `r:<owner>/<repo>:`) isolates every KV key — present and future — without auditing each call site, the failure mode of a key-by-key prefix sweep. bans/trusted-editors/audit/content are repo *files*, so the repo override alone namespaces them (one mechanism, two layers). The token cache had to move from a single global to per-repo (installation tokens are per-install) and `ip_hash` is repo-salted so pseudonyms don't link across tenants. Backward-compat mirrors `ghToken`'s App-or-PAT fallback: a single-tenant Worker (no `MULTI_TENANT`) **ignores** any request repo, so a Worker holding one repo's credential can't be pointed at another. Validation = "is the App installed on the repo?" (cached), which is also why multi-tenant requires the App, not a PAT |
| 2026-06-07 | **Appearance (FEATURES §H/W2) defaults are config-driven with a frontmatter override; precedence is reader's saved choice > page `appearance:` frontmatter > `config.appearance`, all applied pre-paint** | Finishes the half-wired right-rail panel (text size · width · color · skin). Defaults live in `config.appearance` so a fork themes without touching components; a page may set `appearance:` frontmatter for a per-page default (e.g. a wide reference table). The page-default chain is emitted as a `<meta name="wng-appearance">` that the pre-paint `ThemeBoot` script reads from **each incoming document** — so per-page defaults survive View Transitions (a captured closure would go stale) and the read stays no-blink (R1/R4). A reader's own choice (localStorage, same persistence as draft/theme) always wins. The token system is documented at a new `/design` route (FEATURES 166) that renders live swatches + the live panel |
| 2026-06-07 | **A user page is just content in a `user/` namespace, edited through the existing pipeline — no privileged write path; editing a profile is owner-only (not even maintainers), enforced server-side *and* mirrored in the UI** | Storing the profile as `content/user/<login>.md` (slug lowercased — GitHub logins are case-insensitive and `SLUG_RE` is lowercase) means it flows through the *exact* same edit/PR/trust/Turnstile/Filter machinery as any page (invariant: no second write path, no new auth). The only namespace-specific rule is an authorization gate in `prepareEdit`: a `user/<login>` page is editable **only by the signed-in owner** (`login` matches the slug) — anon and other signed-in users, **including maintainers, are refused 403**; maintainers moderate a bad profile through the dedicated **delete/rollback** endpoints rather than rewriting someone's page. The owner publishes their own page live. To avoid a misleading "edit then 403" flow, the **client mirrors the gate**: the Edit tab, the "Create it →" invite, and the editor itself are hidden/refused for non-owners (resolved from `whoami`); the server 403 is the authoritative backstop. The contributions/trust panel beside it is a **read-only** Worker endpoint (`GET /contributions?author=`, KV-cached like `/link-graph`, with a build-time `contributions.json` fallback) reusing the `/changes` data shape — no parallel UI |
| 2026-06-07 | **Categories (M7) are built by inverting frontmatter `tags` into the existing link-graph index, not by scanning pages at read time; subcategory hierarchy and hidden/maintenance classification are derived by convention, not new frontmatter** | The old `/category/<tag>` page fetched every page's Markdown to find tag carriers — slow and not index-backed, and it couldn't do intersection or hierarchy. Realizing the spec's already-stated "link graph = invert `[[links]]` **+ tags**" puts a `categories` (slugified-tag → members) map in the one index the Worker maintains live (KV, patched per edit) with the static `*.json` as fallback — so membership is fresh with **no rebuild** and intersection/hierarchy are pure set ops over it. The only Worker touch is **additive index enrichment** (`buildNode` captures `tags`; `computeGraph` projects `categories`) on the read-index path — **no change to publish/PR/merge** and **no new endpoint** (extends `/link-graph`). **Subcategories** need no new convention: a member page whose slug names a category that itself has members *is* that subcategory (its own tags are the parents) — Wikipedia's "a Category page can be categorised" mapped onto our page/tag model. **Hidden/maintenance** categories are classified by reserved name (a `maintenance`/`cleanup` namespace prefix or a built-in cleanup-tag set) rather than a per-category `hidden` flag, so no category page must exist to mark one. Boolean **intersection** rides the URL as `/category/a+b` (`+` is a safe separator — `slugifyLabel` strips it, so no single tag contains one) |
| 2026-06-07 | **Page Curation toolbar (FEATURES §M) reuses the existing patrol/rollback/delete endpoints and adds one new maintainer route, `POST /tag`, for one-click change-tagging; remaining no-endpoint actions link to the in-site flow** | The New-pages queue, patrol, rollback and delete endpoints already existed (M6), so the reviewer toolbar is mostly a UX layer: one reusable `PageCuration` Solid component triages a page in one place (approve = `POST /patrol`, roll back = `POST /rollback`, propose-delete = `POST /delete`) with optimistic UI + error handling, surfacing patrol state + the revert-risk badge + applied tags inline. It resolves a page's latest sha + patrol bit from `GET /patrol-status` and enriches author/risk/tags from the recent-changes feed (`curation.ts`), so it works from a slug alone on the read view *and* from a handed-in change row on the New-pages tab (no refetch). **Tag is a real action, not a link-out:** rather than send the reviewer to the editor to hand-write frontmatter, `POST /tag` (maintainer-only, audited) read-merges a token into the same `tag:<sha>` KV set the AbuseFilter/3RR pass already writes (reusing the existing `addTag`, now exported), so manual + automatic change-tags share one store and render identically in RecentChanges — a small, well-scoped route that fits the single-Worker model better than a parallel mechanism. The two genuinely view-side actions still **link to the in-site flow** — **message author** → the page's talk, **contributions** → the author's `/changes?author=` (anon) or `/user/<login>` (signed-in). Maintainer-gated from `whoami` (same pattern as the other `/admin` surfaces); renders nothing for everyone else |
| 2026-06-07 | **Optional edge-SSR variant: one content route on demand, switched on entirely from `astro.config.mjs` (an `astro:route:setup` hook), not an `export const prerender` in the page** | The SEO gap was structural: the static read path ships a shell whose content + `noindex` resolve client-side, so non-JS crawlers see an empty/stale page and `noindex` is best-effort. The fix had to be **opt-in and leave the GitHub Pages static build byte-for-byte unchanged**. Astro reads `prerender` only as a literal `true`/`false`, so a computed `export const prerender = !EDGE_SSR` is impossible — but the `astro:route:setup` integration hook can flip *just* `src/pages/[...slug].astro` to `prerender:false` when `EDGE_SSR` is set, with the adapter (`@astrojs/cloudflare`/`@astrojs/netlify`, dynamically imported so they're optional deps) added the same way. Output stays `static`; every other page prerenders. The page branches on `Astro.isPrerendered`: build → the content glob; edge → fetch content/slugs/revisions from jsDelivr@sha + the Worker **at request time** (no rebuild), with the glob as a transient-error fallback. `gitRevisions` (uses `node:child_process`) is lazily imported so it stays off the edge runtime path; the render pipeline is the shared `decorateArticleHtml` so all paths produce identical first-paint HTML |
| 2026-06-07 | **On the edge path `noindex`-until-patrolled is real (server-rendered), the island hydrates with `fresh` (no double-fetch), and freshness is a short edge cache** | The SSR page queries `/patrol-status` server-side and emits `robots=noindex` in the head — JS-less crawlers now honor it — still **fail-open** (Worker/KV hiccup → indexable) so it can't deindex the wiki; the client `PatrolMeta` island is skipped there and kept only for the static host. Since SSR fetched request-time-fresh content, `WikiPage` gets `fresh` and **skips its on-mount refetch** (the "no double-fetch" goal), so freshness comes from a small `s-maxage=30, stale-while-revalidate` edge cache rather than the static path's per-request client fetch — the static path stays the instant-freshness one. A missing slug renders the "create it" UI server-side under a real **404**; a `redirect:` page returns a server-side **301** (better than the client `location.replace`, which stays as the static fallback) |
| 2026-06-07 | **Third identity tier: a centralised, GitHub-optional `wg:<handle>` Wikigit account** (anon + GitHub + Wikigit) | The bot is always the writer, so a new identity source only supplies a commit-author label + trust key — `Writer` already generalises; lets people with no GitHub attribute edits and earn trust. Engine slice is inert until an issuer is configured |
| 2026-06-07 | **Platform splits into 3 projects: Engine (no-DB OIDC *consumer*) · Accounts (OIDC *provider*, has a DB) · Hub (tenant console).** The no-DB / single-Worker invariant binds the *Engine*, not the platform | Accounts/Hub are separate services *precisely so* the Engine keeps its invariant; the deployable wiki never grows a DB, while the account store that needs one lives outside it. The dogfood wiki and every self-host are plain Engine deploys; only the main instance runs Accounts+Hub |
| 2026-06-07 | **Wikigit IdP is self-hostable via standard OAuth2/OIDC; the main instance runs the canonical issuer** | OIDC relying-party config (an `issuer` URL per Engine instance) makes many IdPs natural — default points at the canonical Wikigit IdP, a sovereign operator points at their own — matching the fork-and-go ethos. The Engine's existing OAuth-consumer code generalises from GitHub-specific to pluggable-issuer |
| 2026-06-07 | **Native Wikigit credential is passwordless (email magic-link + WebAuthn passkeys), never a password** | No password hashes / reset flows / breach surface; consistent with the `ip_hash`-only, no-raw-PII stance. Accounts may federate to GitHub so one human gets one `wg:` handle |
| 2026-06-07 | **Accounts is an *adopted* lightweight OSS IdP (Logto rec.; Zitadel alt), not a built OIDC provider; canonical instance operated out-of-the-box, self-host via `issuer` config** | Passwordless + passkeys + OIDC + GitHub-connector + linking are exactly what Logto/Zitadel give out of the box — building our own auth surface is needless risk. We *operate* the canonical one (zero adopter setup); a self-hoster who wants their own points the Engine's `issuer` at any OIDC provider, so we ship no Accounts deployable. The no-DB invariant still holds for the Engine — the account store is the IdP's, external. *(Superseded 2026-06-08 → self-hosted OpenAuth; see below.)* |
| 2026-06-08 | **Accounts runs on Bun/Coolify (not CF Workers), magic-link over SMTP from self-hosted Stalwart as `no_reply@wikigit.org`; deployed live at `auth.wikigit.org`** | OpenAuth's startup RSA keypair (~97ms) blows the Workers free-tier 10ms-CPU cap → 503 on `/authorize`, so it can't run on Workers. Repackaged as a Bun app on Coolify (full CPU) with `MemoryStorage` file-persist + nodemailer SMTP; Engine unchanged (still a public OIDC-ish client). End-to-end verified: emailed code delivered. Follow-up: persistent `/data` volume so signing/encryption keys survive restarts. *(Supersedes the Workers/Email-Sending half of the row below.)* |
| 2026-06-08 | **Accounts = a self-hosted OpenAuth Worker (not Logto/Zitadel); magic-link = the Cloudflare Email Sending binding; Engine is a public client (no secret)** | Scoped to identity + email code only, a ~100-line OpenAuth issuer on Workers + KV + `env.EMAIL.send` is far lighter than a full IAM — Logto/Zitadel were overkill for "nothing but identity + magic link". OpenAuth is OAuth2+JWT (no OIDC userinfo), so the Engine verifies the access-token JWT via the issuer's JWKS (OpenAuth client, lazy-imported) instead of calling userinfo, and runs as a public client (the issuer's redirect_uri allowlist is the protection) → `WIKIGIT_CLIENT_SECRET` dropped. `wg:` keys off the token's stable `sub`, not the handle, so trust survives a handle change |
| 2026-06-07 | **`gh:` and `wg:` link to one identity — GitHub is a social connector on the IdP, not a separate Engine OAuth path** | One human → one `wg:` handle → one trust history + one profile, no double-counting; routing GitHub *through* the IdP gets linking for free instead of reconciling two keys in the Engine. Today's direct GitHub OAuth stays as the fallback until the connector path lands |
| 2026-06-07 | **A fresh `wg:` account gets no trust head start (Sybil gate); trust stays per-repo and earned, real power human-granted** | Magic-link accounts are cheap to mint, so an account must not shortcut tiers — it starts anon-equivalent and earns trust only from merged edits in *that* repo (the account is a stable global label, not a global score). Matches the standing "auto-tiers are gameable → reserve real power for human-granted maintainer" decision |
| 2026-06-07 | **Magic-link is the first native credential (passkeys next); `wg:` commits use a no-PII synthetic author** | Email magic-link is universal (passkeys need enrollment + a colder first run); the real email lives only in the IdP, never in a commit — the author is `wg-<handle>@users.wikigit.invalid`, mirroring the `gh` no-reply / `anon.invalid` pattern |
| 2026-06-07 | **Base reading size bumped to 16px (1rem) in both skins, with the whole type ladder + `--measure` rescaled and chrome left unscaled (FEATURES S8)** | Body text read undersized vs Wikipedia (whose post-2023 accessibility refresh moved content to ~16px). Bumping only `--text-base` would desync the scale, so headings (`--text-lg/-xl/-2xl/-3xl`) and captions (`--text-xs/-sm`) move proportionately while `--text-ui` (chrome) stays put. Done purely as CSS custom properties so it's resolved **pre-paint** (R1/R4, no blink) and a reader's saved Appearance choice still wins; the text-size control is a multiplier on `--text-base`, so its small/standard/large steps stay distinct and ordered on the new base (14/16/18) with no change to the control |
| 2026-06-07 | **Section `[edit]` edits in place via a generic `FocusedEditor` that splices the section back into the whole document and submits through the *same* edit pipeline — no second write path (FEATURES T6)** | A heading's `[edit]` opens a focused editor *on the read page* (WikiPage intercepts the click and portals it under the heading) instead of navigating to the full-page Editor. The component is deliberately generic — `(SectionSpan, source, reconstruct)` — so a header card or infobox row can reuse the same surface later. The invariant that matters: it never writes a section directly; it reconstructs the full doc (`spliceSection` + frontmatter) and calls the existing `submitEdit`, so trust/Turnstile/Filter/diff-preview/deterministic-branch publish are reached identically and the Worker is untouched. `findSection` became level-aware (a `##` carries its `###` children) and gained a pure `spliceSection`, both unit-tested. The baked `/edit?section=` href stays for no-JS/middle-click and as the "edit whole page" escape hatch |
| 2026-06-07 | **Edit page densified by demoting chrome (collapsed properties, compact publish bar), not by removing function (FEATURES T7)** | The page wrapped modest content in too much framing. The properties form collapses by default (it's secondary to the body; opens on create, shows a "N set" badge so populated metadata stays discoverable) and the framed "Publish your change" card becomes a one-row `.publish-bar`. Spacing is tightened through the existing `tokens.css` vars (no magic px) and the editor panes get more viewport. Draft persistence, diff preview, summary, Turnstile and the section deep-link are all untouched — it's a layout/CSS + minor-structure pass with no edit-pipeline change, and the T6 focused surface reuses the same compact controls |
| 2026-06-07 | **Merge/split (M7) = the move primitive's mechanics (gated direct commit + redirect stub) gated like a normal edit; the client composes the page bodies, the Worker only validates/gates/commits** | Merge and split each touch *two* pages, which the one-page-per-PR `/edit` machinery (deterministic `<author>/<slug>` branch) doesn't model cleanly, and doing them as two separate `/edit` calls would need two single-use Turnstile tokens. So `worker/src/handlers/lifecycle.ts` mirrors `movePage` instead: one `resolve()` gate (Turnstile + bans + rate-limit), `runFilters` on each result, a trust-tier check on **every** affected page (insufficient tier → **403**, same as move — structural ops don't fall back to a review PR), then direct commits with a `#REDIRECT` stub for merge. The actual body composition (`merged_from`/`split_from` frontmatter, section carving, heading promotion) is done **on the client** (`src/lib/lifecycle.ts`) where the YAML writer (`withFrontmatter`) and section parser (`listSections`/`findSection`) already live, so the Worker needs no YAML-dump path; it trusts the composed content because it's gated by filters + tier exactly like any edit. Commit order favors not losing content (merge writes the target first, split creates the new page first). Two-commit non-atomicity matches move's accepted tradeoff (pre-release) — a retry re-runs the same gated commits |
| 2026-06-07 | **Named drafts (M7) are client-side localStorage, a second key alongside the scratch autosave — no DB, no new write path** | A draft a contributor *hasn't* submitted shouldn't become a PR or a server write (that's the open-PR-as-draft case, already covered), so real "save WIP and resume later" stays entirely in the browser — the **same model as the existing per-slug scratch draft** (`draft.ts`), just a separate `wng-drafts` list so an explicit save and the autosave don't clash. Keying a resumed draft by `?draft=<id>` (like `?revert=`/`?template=`) reuses the editor's existing seed-on-mount precedence (revert > named draft > scratch > template) and deletes the draft once it publishes, so resumes don't pile up. Pure list operations are split from the localStorage wrappers so they unit-test without a DOM. Honors the no-rebuild + single-Worker invariants for free (nothing leaves the browser until the normal edit flow runs) |
| 2026-06-08 | **Bot check is now an in-browser proof-of-work, replacing Cloudflare Turnstile — one less external system** | Turnstile meant a third-party widget, an account, and two keys (`TURNSTILE_SITE_KEY`/`SECRET`) to maintain. Swapped for a self-hosted PoW: the browser mints `<ts>.<salt>.<nonce>` and searches for a nonce whose SHA-256 has `POW_BITS` leading zero bits (default 18, ~half a second on one thread), solved with a vendored **synchronous** SHA-256 (`src/lib/sha256.ts` — Web Crypto's digest is async-only and far too slow for a hash-search loop) run in ~4k-hash chunks that yield so the click doesn't freeze the page. The Worker (`verifyPow`) re-hashes **once**, checks difficulty + a 2-min freshness window + single-use (KV `pow:<ts>.<salt>`), and reuses the existing `token` plumbing through `resolve()`. On by default (`POW_BITS=0` disables; client/Worker bits must match). Tradeoff: PoW is a *cost* deterrent, not a true human test — a determined bot can still pay the CPU — but alongside rate-limit + bans + PR review it's enough, and it removes the dependency. Signed-in users still skip it |
| 2026-06-08 | **Removed the pre-publish content/spam filter (`filters.ts`/`filters.json`/`runFilters`) — spam handled another way** | The AbuseFilter-style rule pass (blanking/byte/link/domain checks + regex rules, `disallow`→422 / `tag`) is gone. Its only structural outputs were kept alive cleanly: the `tag:<sha>` KV set, RecentChanges badges and the revert-risk `tags` input now come solely from 3RR's `edit-war` flag (`EditContext.verdict` → `EditContext.tags: string[]`). Merge/split drop their filter calls. No replacement gate added in the Worker — by design, spam control will live elsewhere |
| 2026-06-08 | **Page navigation keeps `ClientRouter` but drops the cross-fade; curation bar hydrates eagerly + shares one whoami fetch** | Two read-view annoyances. (1) The View Transitions fade read as "app-like," not wiki-like — a global `::view-transition-old/new(root){animation:none}` makes the swap instant while keeping in-site navigation (no full reload, header still `transition:persist`). (2) The maintainer curation bar popped in late: it's viewer-specific so it can't be SSR'd, but it was `client:idle` (waits for idle) and every island re-fetched `/whoami`. Now `client:load` (fetch starts immediately) + a module-level shared `whoamiOnce` promise so the bar resolves from cache with no flash on subsequent in-site navigations (a full reload on sign-in/out drops it) |
| 2026-06-08 | **Flagship CF Pages deploy turns edge-SSR on (`EDGE_SSR=cloudflare`) to kill the stale-then-fresh read flash** | The static path paints the build-time content glob, then `WikiPage`'s `onMount` refetches the latest from jsDelivr and swaps it in — a visible blink whenever content changed since the last *code* deploy (and content edits don't redeploy, so that's common). Rather than a client skeleton-then-fresh hack, switch the flagship to the already-shipped edge-SSR variant: the content route renders on demand, fetching request-time-fresh content server-side, so the island gets `fresh` and skips its refetch — first paint is the fresh HTML, no blink, no skeleton, SEO intact. Freshness is the `s-maxage=30, stale-while-revalidate` edge cache (not the static path's per-load fetch). One env var in `deploy-cf-pages.yml`; the build emits a Pages `_worker.js` + `_routes.json` (genuinely-static routes excluded). Forks/GitHub Pages stay pure static (flag unset) |
| 2026-06-14 | **Move the backend off the single Cloudflare Worker onto a portable Bun server; wikigit.org runs it centrally (free for end users), anyone can self-host; Cloudflare becomes one optional host, not built-in** (M11) | The Worker free tier was the "near-zero infra" hook, but it locks the backend to one vendor/runtime, and the 10 ms-CPU cap already forced `accounts/` off Workers onto a Bun app on Coolify — that's the proven template. A portable Bun process runs anywhere Bun runs (VPS / Coolify / Fly / even CF Containers), so the central instance scales for a real free-tier product and a self-hoster isn't tied to Cloudflare. Reads are unaffected (CDN/jsDelivr), so the server only ever handles writes + a few dynamic GETs — cheap enough to offer free. The §5 irreducibility argument is runtime-agnostic (the browser still can't hold a write credential), so nothing about the model changes, only the host. Design + migration: `analysis/11-portable-backend-plan.md` |
| 2026-06-14 | **Backend stays no-DB: state is in-memory + git, no relational/KV store added** (M11/D2) | Keeps the Engine's no-second-store invariant even as a real server. The realization that makes it work: sessions (HS256 JWT), OAuth login-state (signed token) and PoW tokens (self-verifying) are **signature-based**, so they survive restart with no store; rate-limit/PoW-single-use/3RR and the trust/link-graph/cite caches are **ephemeral in-memory** behind the existing `namespacedKV` seam (a `MemoryKV` Map+TTL), rebuilt from git/content on a miss (rebuild-on-miss + static-`*.json` fallback already exist), so a restart only re-warms caches and opens a ~2-min PoW-replay window — harmless. The only state that is neither stateless nor a cache is **durable moderation decisions**, which already live in git files (`bans.json`/`trusted-editors.json`/`suppressed.json`/`audit-log.jsonl`) |
| 2026-06-14 | **Patrol bits + manual change tags move from KV to a git append-log `.wikigit/moderation.jsonl`, hydrated to memory on boot** (M11/D5) | `patrol:<sha>` and `tag:<sha>` are durable decisions, not derivable from page content, so under no-DB they can't be ephemeral-in-memory (a redeploy would re-show every page as unpatrolled). The `audit-log.jsonl` pattern fits exactly: append a line to a single git file per patrol/tag action (git = durable truth, audited, tamper-evident in the commit), hydrate it into the same in-memory view the read endpoints already use at boot, serve/update from memory. Rejected fail-open-ephemeral (simpler but loses moderation memory across deploys) and a real KV/DB (breaks no-DB). Compaction mirrors whatever `audit-log.jsonl` adopts |
| 2026-06-14 | **No-DB caps easy horizontal scale; central instance scales vertical-first, then shards by tenant — not a shared store** (M11) | In-memory rate-limit/PoW can't be shared across processes, so spraying stateless app processes would break those gates. Accepted because the backend only does writes (reads are CDN), and write volume is tiny, so one Bun process serves a high rate for a long time. When one box isn't enough, the no-DB-preserving exit is **consistent-hash `repo → process`** so each tenant's counters live in exactly one process (correctness intact, still no shared store) — chosen over introducing Redis precisely to keep the invariant. Written down as the known ceiling + planned exit so it isn't a surprise |
