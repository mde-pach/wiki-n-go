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
      Deploy + secret provisioning fully in CI (`deploy-worker.yml`): random
      secrets auto-generated (never rotated), the rest from repo secrets. Repo +
      discussion-category IDs derived at runtime; site config injected from repo
      context at build. Fork-and-go needs only repo secrets/variables, no edits.

### M2 — Optional GitHub-login attribution ✅
- [x] ✅ "Sign in with GitHub" → Worker OAuth exchange (`read:user` only). Worker
      mints a stateless HS256 session JWT (no DB, no stored user token); the
      client replays it as a bearer token (cross-origin → not a cookie).
- [x] ✅ Edits attributed to the signed-in identity — commit author = the user's
      GitHub no-reply email (profile link + contribution credit, **no PII**).
      Worker stays the only writer; sign-in just swaps the identity label.
      Signed-in users follow the same trust gate as anon (earn tiers from
      history). Flag-gated by `oauthEnabled` / OAuth env — inert until wired.

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
- [x] ✅ Discussion Stage B: signed-in users' topics & comments render under their
      GitHub login + avatar (via a `gh:<login>|<avatar>` body marker; bot still posts). Shares the M2 sign-in.
- [x] ✅ Multi-host deploy buttons (Netlify / Vercel / Cloudflare) in README.
- [ ] ⬜ (Optional) edge-SSR variant for SEO.

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
- [x] ✅ **Every edit is a PR; trust decides only *when* it merges.** The Worker opens a branch + PR for every
      edit, then for a qualifying tier **squash-merges it immediately** (the same path a maintainer's manual merge
      takes); below-tier edits wait for review. A PR that won't merge cleanly (a concurrent change touched the same
      lines) is **left open and falls into the review queue** — so git's 3-way merge is the single edit-conflict
      detector for both paths. On a clean auto-merge: busts `meta:latest-sha`/`meta:pages` cache, patches the index,
      autopatrols, deletes the branch (live, no rebuild). *(Replaced the earlier direct-commit-to-`main` path — see
      Decision Log 2026-06-06.)*
- [x] ✅ **Trust tiers** on `ip_hash`, **derived from git history** (not a ledger): count + first-seen of commits the pseudonym authored on the branch → open/auto/extended; `trusted-editors.json` = maintainer. Covers direct commits **and merged PRs** (both are commits by the pseudonym), so PR-only contributors earn trust too — no webhook, single source of truth. KV caches stats (1 h TTL, busted on the author's own commit).
- [x] ✅ Page protection = a `protection:` **frontmatter field** (env default when unset); a privileged page-property, gated per-field on save (can't raise above / lower from above your tier). Replaced `protection.json`+globs. TODO: `expires`, CODEOWNERS.
- [x] ✅ Verified end-to-end: anon edit to an `open` page **auto-merges live** (PR opened then squash-merged); a
      conflicting edit stays an open PR for review; flipping its `protection` rejected 403; protected pages wait for review.
- [x] ✅ AbuseFilter-style pre-publish rule pass (`filters.json`): built-in checks (blanking, added-bytes, added-link count, blocked domains) + maintainer regex rules; actions `disallow` (422) / `tag` (KV `tag:<sha>` → RecentChanges badge + PR body). Trusted tiers exempt. Pure `evaluateFilters` unit-tested.
- [x] ✅ **Revert-risk heuristic** (`worker/src/risk.ts`): a 0–100 score per change from byte deltas + anon +
      page-creation + tags (no extra fetch), surfaced in `/changes` → a **"high risk" badge** + **High-risk-only
      filter** in the console. **3RR**: a per-author-per-page 24 h KV counter (`THREE_RR_MAX`, default 3) flags the
      4th rapid edit `edit-war` (trusted tiers exempt) → review badge + risk bump. Both unit-tested.
- [x] ✅ PR-only contributors earn tiers — solved by deriving from git history (above), no webhook needed.
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
      Append-only `audit-log.jsonl` records rollback/ban/unban. New **Blocks** + **Audit log** tabs in `/admin`
      (`GET /bans`, maintainer-only `GET /audit`). TODO: ban `expires`, path-scoped blocks in the abuse path.
- [x] ✅ **Protection + rights management** — Worker `POST /protect {slug, tier}` rewrites the page's `protection:`
      frontmatter via a targeted line edit (clean diff); `POST /grant`/`/revoke` (+ `GET /editors`) edit
      `trusted-editors.json` to add/remove maintainers (the owner is always one). **Protection** + **Rights** tabs in
      `/admin`, all audited. TODO: CODEOWNERS / GitHub-team sync, protection `expires`, current-protection display.
- [x] 🟡 **Oversight/suppression** — `suppressed.json` entries (author / revision) the Worker **redacts server-side**
      in `/changes` + `/history` (label → `[suppressed]`), so suppressed data never reaches the page. `POST /suppress`/
      `/unsuppress` (+ `GET /suppressed`), **Suppression** tab, audited. Full **hard-purge** (git history rewrite +
      CDN purge) stays a **manual owner op** — the Worker can't rewrite history via the contents API.
- [x] ✅ **New-Pages queue + deletion** — `/admin` **New pages** tab lists recently created pages (from `git log`
      file-status `added`) with patrol state + a maintainer **delete** (`POST /delete`, audited). Deleted pages remain
      in git history → **undelete = restore a pre-deletion revision** from History (no separate endpoint needed).

### M7 — Special pages & content lifecycle 🟡
Read-time reports + git-native operations (see `FEATURES.md` §§O–P):
- [x] ✅ **Link graph** (invert `[[links]]` + tags) — built at build time **and served live by the
      Worker** (`/link-graph`, `/search-index`): a per-slug KV index maintained *incrementally* on each
      direct edit (full rebuild only on a cache miss), so it's fresh with no site rebuild; the app prefers
      the Worker and falls back to the static `*.json`.
- [x] ✅ Special pages at `/special`: WhatLinksHere · **PageInfo** · Wanted · Orphaned · Dead-end ·
      **Redirects (broken/double)** · AllPages · MostLinked · Statistics · Random. (RecentChanges lives
      at `/changes`.)
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
      TODO: merge/split, drafts.

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
| 2026-06-06 | **`noindex`-until-patrolled is client-side + fail-open**, not server-rendered | The read path is static/CDN with no Worker in front (no SSR yet), so the page can't know patrol state at build; a small read-view island sets `robots=noindex` from `GET /patrol-status`. JS-running crawlers honor it; failing open means a Worker/KV blip never deindexes the wiki. Revisit if an edge-SSR variant lands |
| 2026-06-06 | **restore-to-revision and protection edits are maintainer-only direct commits**, reusing the rollback path | Consistent with rollback (privileged, no Turnstile, lands as a reversible revision); avoids routing a History/console action through the full anon edit+Turnstile flow. Normal-editor undo (gated like a regular edit) can come later |
| 2026-06-06 | **Page protection set by a targeted frontmatter line edit**, not a YAML reparse-and-redump | Preserves the rest of the frontmatter + body byte-for-byte → clean diffs; the `protection:` field is a simple scalar, so a line replace/insert/remove is safe and unit-tested |
| 2026-06-06 | **Autopatrol is tier-gated** (`AUTOPATROL_TIER`, default `extended`), set on the commit — not a separate human-granted right | Trusted edits shouldn't clog the patrol queue or get `noindex`'d; deriving from the existing tier scale (no new grant/state) keeps one source of truth. Kept modest by default since auto tiers are IP-gameable — real power still needs a human-granted maintainer slot |
| 2026-06-06 | **Deletion is an ordinary file-delete commit; undeletion = restore a pre-deletion revision** (no separate undelete endpoint, no tombstone) | Git already retains deleted content + the path's history, so "undelete" is just the existing restore-to-revision from History — one mechanism, no dead-letter store. New-pages queue derives "created" from commit file-status `added`, no extra index |
| 2026-06-06 | **Rights = editing `trusted-editors.json`** from the console (`/grant`/`/revoke`), not GitHub-team/CODEOWNERS API calls | The maintainer allowlist already drives `editorTier`; editing it is one committed file (git is the record, audited) and needs no extra token scope. GitHub-team/CODEOWNERS sync is a later add-on, not the primitive |
| 2026-06-06 | **Suppression redacts server-side at read time; hard-purge stays a manual owner op** | The Worker redacts author/revision labels in `/changes`+`/history` before they leave it (stronger than client-side hiding — suppressed text never reaches page source), but it **cannot rewrite git history** via the contents API, so true purge (history rewrite + CDN purge + source PR/Discussion delete) is documented as a manual owner procedure — the one place the no-rebuild model bends |
| 2026-06-06 | **Revert-risk is a read-time heuristic from data already on each change**, not a score stored per commit; **3RR is a tag, not a block** | Computing risk at read time (byte deltas + anon + tags) covers direct *and* PR-merged commits without the keying problem of storing `risk:<sha>` at edit time, and needs no extra fetch. 3RR flags `edit-war` rather than throttling because legit rapid edits happen — the risk score + patrol queue triage it. Both leave room for an ML model / link-churn upgrade later |
| 2026-06-06 | Interlanguage (M8): translations are **independent pages** linked by a **symmetric, uniform frontmatter `translationKey`** (every member carries it; default-language version **optional**); **default language is configured + languageless** (bare slugs, no migration), other languages are URL-prefixed + localized (`/fr/cafe`) | Different slug/content per language ⇒ separate pages; a symmetric key (not a pointer to a canonical page) lets an article exist only in non-default languages; key-link is cheap and on-pattern (like `redirect:`); languageless default avoids migration; URL shape and link mechanism are independent choices |
| 2026-06-06 | M4.5 P2 syntax: **@mention** = `@anon-<hash>` / `@<github-login>` (bare `@`, no brackets); **citations** = `{{cite\|key=value\|…}}` (MediaWiki-style double-brace); both are **markdown-it inline rules**, citations reuse the footnote plugin's machinery | A bare `@handle` matches the universal social convention and GitHub's own login grammar (so anon-hashes and logins share one rule, classified by an `anon-` prefix); `{{cite\|…}}` mirrors Wikipedia's template syntax editors expect. Inline rules (not regex over rendered HTML) means code spans / emails / fenced blocks are skipped for free, and routing `{{cite}}` through `markdown-it-footnote`'s env gives shared `[n]` numbering, reuse, backlinks, and hover tooltips with no parallel reference system |
| 2026-06-06 | **Mermaid** is the first markdown plugin admitted as a dependency, but **dynamically imported** (own chunk, loaded only on pages with a `` ```mermaid `` block) and run at **strict security level** | Diagrams are high-value for a technical wiki, but the engine is ~135 kB gzip — lazy-loading keeps it off the base bundle (read-path stays light), and diagram source is user-editable content, so strict (sanitizing) mode is mandatory. The fence degrades to a code block without JS |
| 2026-06-06 | **Unify the write path: every edit is a PR; "trusted" just auto-merges it now instead of waiting for review.** Reverses the M5 direct-commit-to-`main` path (and retires the short-lived base-SHA conflict check that briefly preceded it) | One code path for trusted and untrusted edits, and **git's 3-way merge becomes the single edit-conflict detector** — strictly better than a base-SHA compare (it auto-resolves *non-overlapping* concurrent edits and only conflicts on overlapping hunks) and it covers the new-page add/add race for free. Conflicts **degrade gracefully**: an un-auto-mergeable PR is left open and lands in the existing review queue rather than bouncing the contributor. Cost accepted: ~4–5 GitHub calls per publish vs. one, and GitHub's async mergeability can occasionally defer a clean edit to review (safe degradation; pre-release). Aligns with the FEATURES §K "direct-commit / **auto-merge**" north star |
| 2026-06-06 | Revision page (V1): **compare-any-two via per-row older/newer radios + a "Compare selected" button**, kept alongside the per-row cur/prev quick links; the diff gains an add/remove **legend** and a **permalink footer** behind new *optional* `DiffView` props | The side-by-side `DiffView` already existed; V1 finishes the half-wired UI (the `.rev-radios`/`.diff-legend`/`.diff-foot` CSS was present but unused). Radios are Wikipedia-faithful and reuse the existing `/diff?base&head` endpoint with no Worker change; new props default to off so `ReviewQueue`'s `DiffView` usage is unchanged. Diff is computed client-side from the unified patch (`src/lib/diff.ts`, now unit-tested), so no rebuild and no extra Worker work |
| 2026-06-06 | **Pre-submit diff preview is computed client-side** from the two full texts (`diffLines`, an LCS line-diff), not by asking the Worker for a patch | The edit isn't a commit yet, so there's no SHA range for `/diff` — and the editor already holds both the loaded original and the assembled new doc, so an in-browser LCS reuses the same `DLine[]`/`DiffView` pipeline with zero Worker calls. Long unchanged runs collapse to a `⋯ N unchanged lines ⋯` separator so the dialog stays readable; the diff is memoised behind `modal()` so it costs nothing per keystroke |
