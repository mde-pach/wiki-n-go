# SPEC — Fork-and-Go Wiki

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

---

## 6. Identity Model

We never run an auth database. Identity is whatever fills the commit `author`:

| Mode | Identity source | Stored where | Notes |
|---|---|---|---|
| Anonymous (primary) | `ip_hash = HMAC(secret, ip)` | **derived, not stored** | stateless pseudonym, e.g. `anon-3f9a2c` |
| GitHub sign-in (optional) | GitHub OAuth | nowhere (GitHub's) | inherits GitHub abuse defense + attribution |

Rules:
- **Never** write a raw IP or email into the repo (immutable + public = unredactable PII).
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
- **Worker (editing only):** one Cloudflare Worker — anonymous relay + optional
  OAuth (based on the `sveltia-cms-auth` pattern for the OAuth half).
- **Read CDN:** jsDelivr, pinned to commit SHA.
- **Discussion:** giscus (GitHub Discussions).
- **Hosting:** multi-host via **click-to-deploy** buttons (GitHub Pages /
  Cloudflare / Netlify / Vercel). **Start on GitHub Pages** (read-only phase
  needs no Worker). Avoid Vercel Hobby for production (non-commercial only).
- **Later:** optional Astro edge-SSR adapter (Cloudflare/Netlify) to server-render
  content for SEO on production hosts — still no rebuild.

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
      Deploy via `worker/deploy.sh` reading gitignored `worker/.deploy.env`.

### M2 — Optional GitHub-login attribution
- [ ] ⬜ "Sign in with GitHub" → Worker OAuth exchange.
- [ ] ⬜ PR authored by the signed-in user's identity.

### M3 — Moderation & abuse (essential)
- [x] ✅ `bans.json` at repo root (outside anon-writable `content/`) + Worker 403 on banned `anon-<hash>`.
- [x] ✅ Anon edits never auto-merge — every edit is a PR awaiting manual review (default).
- [x] ✅ Slug hardened: no leading/trailing/double slash, no traversal (Worker `SLUG_RE`).
- [x] ✅ Rate-limiting live: KV fixed-window, 5 edits / 10 min per `anon-<hash>`.
- [x] ✅ Turnstile bot check on edits (Worker verifies `cf-turnstile-response`; 400 without a token).

### M4 — Discussion, deploy & polish
- [x] ✅ Anonymous discussion: comments via Worker → GitHub Discussions, stamped `anon-<hash>`
      (replaced giscus, which required a GitHub login). Read is public; posting is Turnstile + rate-limited.
- [x] ✅ Talk threading: each topic is a titled GitHub Discussion (`talk:<slug> · <title>`); arbitrary-depth
      replies via a `<!-- reply-to:<id> -->` marker rebuilt into a tree client-side. Per-comment reply +
      permalink; reply-count and last-activity in the topic index.
- [ ] 🟡 Discussion Stage B: "Sign in with GitHub" → comments post as the user (needs an OAuth App).
- [x] ✅ Multi-host deploy buttons (Netlify / Vercel / Cloudflare) in README.
- [ ] ⬜ (Optional) edge-SSR variant for SEO.

### M4.5 — Wikipedia page features ✅ (mostly)
- [x] ✅ References/footnotes + citation hover tooltips; captioned figures.
- [x] ✅ Frontmatter layer → infobox, categories (chips + `/category/<tag>`), hatnotes, maintenance banners.
- [x] ✅ Per-section `[edit]` links; TOC (desktop + mobile); icons; self-hosted fonts.
- [ ] ⬜ P2 polish: hover page previews, @mention linkify, named-ref reuse, citation templates, richer search.

### M5 — Autonomous editing mode (immediate publish + post-hoc moderation) ⬜
Invert the default selectively. Critical path (see `FEATURES.md` §§K–N):
- [ ] ⬜ Worker **direct-commit / auto-merge** path + jsDelivr cache purge on commit.
- [ ] ⬜ `protection.json` per-path required-tier (+ `expires`) + CODEOWNERS for full protection.
- [ ] ⬜ **Trust ledger** on `ip_hash` (KV/D1 bound to the Worker): autoconfirmed/extended-confirmed analogs → auto-merge.
- [ ] ⬜ AbuseFilter-style rule pass (`filters.json`) + spam/title blocklists; per-hash rate limits; change-tagging.
- [ ] ⬜ Revert-risk heuristic score on diffs; 3RR revert-churn detection.
- [ ] ⬜ Consider `ip_hash` salt/epoch rotation (cap long-term linkability).

### M6 — Owner admin dashboard & governance ⬜
The sysop console for the autonomous model (see `FEATURES.md` §N):
- [ ] ⬜ RecentChanges feed (from `git log`/PRs) + **patrol queue** + `noindex`-until-patrolled.
- [ ] ⬜ One-click **rollback / undo / restore**; partial (path-scoped) blocks in `bans.json`.
- [ ] ⬜ Protection & rights management (CODEOWNERS / GitHub team) from the dashboard; append-only audit log.
- [ ] ⬜ **Oversight/suppression**: render-time redaction + owner-only hard-purge (history rewrite + CDN purge).
- [ ] ⬜ New-Pages queue + Page-Curation-style reviewer overlay; deletion flow (CSD/PROD/AfD via PR policy).

### M7 — Special pages & content lifecycle ⬜
Read-time reports + git-native operations (see `FEATURES.md` §§O–P):
- [ ] ⬜ **Link graph** (invert `[[links]]`+includes+tags) — keystone for WhatLinksHere/orphans/wanted/dead-end/redirects.
- [ ] ⬜ Special pages: RecentChanges, Random, Stats, AllPages, PageInfo, double/broken redirects, MostLinked.
- [ ] ⬜ Move/rename (`git mv` + redirect stub); redirects; merge/split; drafts; creation wizard.
- [ ] ⬜ Short descriptions; permalink-by-SHA (`/page@<sha>`); **Citoid-style auto-cite** (URL/DOI/ISBN).

---

## 10. Open Decisions

- [x] ~~Rate-limiting mechanism~~ → **KV fixed-window** (5 / 10 min per source).
- [ ] **`ip_hash` input:** full IP vs. coarsened (`/24` / geo) for extra safety.
- [ ] **Auto-merge policy:** which (if any) signed-in contributors bypass review.
- [x] ~~SHA resolution~~ → **Worker `/latest`** (KV-cached ~20s, authed quota) with
      GitHub-API fallback; `no-store` so the browser never pins a stale SHA.
- [ ] **SSR-edge variant:** when/whether to add it for SEO.
- [ ] **PKCE watch:** drop the OAuth half of the Worker once GitHub supports
      client-side PKCE.

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
