# FEATURES — Wikipedia page teardown → dev tracker

Derived from a live teardown of a real article (en.wikipedia.org/wiki/Espresso,
Vector 2022), region by region. Each row: what Wikipedia actually renders → our
equivalent on the git-backed stack → status + priority.

Status: ✅ done · 🟡 partial · ⬜ todo. Priority: **P0** core feel · **P1** important · **P2** later.
Effort: **★** cheap (git/GitHub gives it) · **⚒** build.

---

## A. Global chrome (`banner`)
The persistent top bar: menu, wordmark, search, personal tools.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Wordmark / home link | site title → home | 🟡 | P0 |
| **Search box** (full-text) | full-text search over the manifest/content (AND-ranked, snippets, keyboard nav) | ✅ | P1 |
| Main-menu button (nav drawer) | header hamburger → left slide-out drawer (Home · Help · Special · Recent changes · Create); `452b0a7` | ✅ | P1 |
| Personal tools (login/donate/account) | optional GitHub sign-in only; no login wall | ⬜ | P2 |
| "Jump to content" skip link | a11y skip link | ✅ | P1 |

## B. Page header (title + action bars)
Sits above the article: title, the two tab rows, page tools, appearance, languages.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| `h1` page title | page title from H1/frontmatter | 🟡 | P0 |
| **Namespaces tabs**: Article · Talk | tabs: Read · **Talk** (our discussion) | 🟡 | P0 |
| **Views tabs**: Read · Edit · View history | tabs: Read · **Edit** · **History** | 🟡 | P0 |
| **Page tools**: what-links-here, permanent link, page info, cite | permalink (jsDelivr@sha ★), backlinks (manifest ⚒), page info ★, cite ⚒ | ⬜ | P1 |
| **Appearance**: text size · width · color theme | right-rail panel (Vector-2022, `col-info`): text size · width · color · skin over the theme tokens; defaults from `config.appearance` (+ per-page `appearance:` frontmatter), reader's saved choice wins, all applied pre-paint (no blink); documented at `/design` | ✅ | P1 |
| Languages (interwiki) | n/a v1 | ⬜ | — |
| "From … / tagline" | optional subtitle | ⬜ | P2 |

## C. Table of Contents (`navigation "Contents"`)
A sticky, collapsible, nested sidebar auto-built from headings.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Auto TOC from heading tree | build TOC from rendered headings (`Toc`, SSR initial items) | ✅ | P0 |
| Sticky + active-section highlight on scroll | IntersectionObserver | ✅ | P1 |
| Collapse / hide; mobile drawer | responsive behavior (`TocMobile`) | ✅ | P1 |

## D. Article body (`main` content)
The core, in render order observed on the page.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| **Hatnotes** ("This article is about… For…") | frontmatter `hatnote` | ✅ | P2 |
| **Maintenance banners** ("needs additional citations") | frontmatter `banner` (info/warn) | ✅ | P2 |
| **Lead section** (bold title term, summary) | `emphasizeLeadHtml` bolds the title term when the lead opens with it | ✅ | P1 |
| **Infobox** (fact panel, floats top-right) | frontmatter-driven; float desktop / stack mobile (`Infobox`) | ✅ | P1 |
| **Section headings** + `#` anchors | slugged headings, hover anchor (markdown-it-anchor) | ✅ | P0 |
| **Per-section `[edit]`** links | split markdown by heading, edit one (`addSectionEditLinks`) | ✅ | P1 |
| **Figures** (images + captions) | markdown images + `<figure>` caption (`lib/figures`) | ✅ | P1 |
| **Blockquotes / tables** | markdown native | ✅ | P0 |
| **References / footnotes** `[1]` + reflist + backlinks | markdown-it footnotes → cite markup | ✅ | P1 |
| **Named-ref reuse** (one note, many cites) | `[^name]` reused → single reflist entry + lettered backlinks (a/b/c) (`markdown.ts`) | ✅ | P2 |
| **Citation templates** | `{{cite\|url=…\|title=…}}` → formatted footnote; `ref=` reuses one entry (`lib/citetemplate`) | ✅ | P2 |
| Reference **tooltips** on hover | popover on citation marker (`attachCiteTooltips`) | ✅ | P2 |
| **@mention** linkify | `@anon-<hash>` → contributions filter, `@login` → GitHub profile (`lib/wikilink` mention rule) | ✅ | P2 |
| **Internal links `[[Page]]`** + **red links** | rewrite via manifest; red = missing, resolved before paint | ✅ | P0 |
| **Hover page previews** | popup card on internal link (`lib/previews`); `db1cff8` | ✅ | P2 |
| **See also / External links** sections | markdown convention | ✅ | P1 |
| **Navboxes / transclusion** (template grids, shared blocks) | `{{slug}}` on its own line transcludes another page's body, filled from the CDN at read time; recursion-bounded + cycle-safe (`lib/transclude` + `decorate`) | ✅ | P2 |
| **Categories** footer | frontmatter `tags` → `/category/<x>` (footer chips) | ✅ | P1 |
| Authority/Wikidata strip | n/a → **"view source on GitHub"** provenance | ⬜ | P2 |

## E. Footer (`contentinfo`)
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| "**Last edited** on `<date>`" | "last edited by `anon-<hash>` · `<date>`" from git, SSR'd (`PageMeta`) | ✅ | P0 |
| License / terms / trademark | license + "view page source" provenance line in the footer | ✅ | P1 |
| Mobile view toggle | responsive (no separate view) | — | — |

## F. History & revisions (git = our superpower)
Observed on `?action=history`: each row has cur/prev diff links, two compare
radios, timestamp→revision, author + talk + contribs, byte size + delta, summary,
and undo/thank/tag actions; Newer/Older pagination.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Revision list: date · author · **summary** · **size + byte delta** | `git log` w/ stats (Worker `/history`, `History`) | ✅ | P0 |
| Per-row **cur / prev** diff links | diff vs latest / previous | ✅ | P0 |
| **Compare any two** (radio select) | per-row older/newer radios + "Compare selected" → `/diff?base&head` (`History`→`DiffView`) | ✅ | P0 |
| Diff render (add/remove coloring) | split/unified render + add/remove **legend** + word-level highlights + **expandable collapsed context** + copy-permalink (`DiffView`) | ✅ | P0 |
| Permalink to a revision | jsDelivr `@<sha>` via `?rev=` (old-revision banner) | ✅ | P1 |
| **Undo / revert** a revision | History "undo" → editor seeded with that revision (`?revert=<sha>`), routed through the normal edit flow (trust gate + diff preview); maintainers keep the instant `restore` | ✅ | P1 |
| Pagination (Newer/Older) | paginate commits (★) | ⬜ | P2 |
| Per-line blame | GraphQL `blame` (★) | ⬜ | P2 |
| "Thank" an edit | n/a (maybe a 👍 reaction) | ⬜ | — |

## G. Editing flow
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| In-page editor | textarea editor → PR | ✅ | P0 |
| Edit summary | surfaced summary field → commit/PR | ✅ | P0 |
| **Live preview** | renderer beside textarea, updates as you type | ✅ | P0 |
| Section editing | `?section=` deep-link selects + scrolls to that section | ✅ | P1 |
| Create-new-page (red link → create) | red link → create; `/new` wizard (title → slug + template) | ✅ | P0 |
| Show diff before submit | confirm dialog shows size delta **+ a full side-by-side/unified diff** of the pending edit (`diffLines` → `DiffView`, computed client-side; long unchanged runs collapsed) | ✅ | P1 |
| Edit-conflict detection | git 3-way merge on the auto-merged PR; overlapping conflict → PR stays in the review queue (see §K) | ✅ | P1 |
| Submit progress feedback | publish phase streams NDJSON milestones (open PR → publish → go live) → live progress bar in the editor | ✅ | P1 |
| Anti-bot (already have) | Turnstile | ✅ | — |

## H. Theming / appearance (our "Appearance" menu)
Design token system adopted from `.design/` (single source of truth): two skins
(Wikigit / Wiki) × light/dark, semantic roles only. The **Wiki** skin is a
near 1:1 replica of Wikipedia (Vector 2022 / Codex tokens).

| Feature | St | Pri |
|---|---|---|
| Tailwind + centralized tokens (design `tokens.css`) | ✅ | P0 |
| Light / dark mode | ✅ | P0 |
| Swappable skins (Wikigit / Wiki) | ✅ | P1 |
| Theme + skin toggle → Appearance right-rail panel (Vector-2022); final UI | ✅ | P0 |
| Width control (Standard/Wide) | ✅ | P1 |
| Config-/frontmatter-driven theming | ✅ | P1 |

## I. Talk page (Discussion namespace) — threaded, topic-organized, signed
From the French `Discussion:Expresso` (real threads): each **topic** is a titled
`==section==` with its own metadata header ("last comment 18y ago · 1 comment ·
1 participant"), arbitrarily **indented replies**, **signatures** (author · talk/
contribs · timestamp permalink), and a per-comment **"Répondre" (reply)** button.

Architecture: map each **topic → one GitHub Discussion** (titled); "New topic" =
create a discussion. Threading is **arbitrary depth** via a `<!-- reply-to:id -->`
marker we reconstruct into a tree client-side (GitHub Discussions natively nests
only **one** level), reusing the same marker trick as `anon-<hash>`.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Anonymous comments | via Worker → GitHub Discussions | ✅ | P0 |
| **Topics** = titled threads; "New topic" | one Discussion per topic, titled | ✅ | P1 |
| Per-topic metadata (last-comment age · #comments · #participants) | reply count + last-activity age + participant/message counts; `0b62678` | ✅ | P2 |
| **Arbitrary-depth replies** (indentation) | reply-to marker → client-rebuilt tree | ✅ | P1 |
| Per-comment **reply** button + more menu | reply box under each comment (more-menu deferred) | 🟡 | P1 |
| **Signature**: author · timestamp · **comment permalink** | author + relative time + per-comment permalink | ✅ | P1 |
| **@mentions** of contributors | parse + link (anon handle / GitHub user) (⚒) | ⬜ | P2 |
| Talk header / guidelines banner | guidelines banner above the topic list; `0b62678` | ✅ | P2 |
| Unsigned-comment attribution | n/a — we always stamp the author | ✅ | — |
| Archives, WikiProject/assessment, find-sources | Wikipedia-specific | ⊘ | — |

## J. Cross-page chrome (seen on every namespace)
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Same header/footer/TOC/appearance on Article, Talk, History | one shared layout across all page types | 🟡 | P0 |
| Namespace tabs adapt (Article↔Talk, Read/Edit/History) | two-group tab strip: namespace (Article·Discussion) + views (Read·Edit·History·Tools), active state per current view (W2); `8bb15f8` | ✅ | P0 |
| User links: profile · **talk** · **contributions** | GitHub users: in-site `/user/<login>` profile + contributions panel (`@login` mention links to it); anon: filter-by-`anon-<hash>` on `/changes` (no profile by design) | 🟡 | P2 |

---

## Already shipped (data + plumbing)
- ✅ Read path (no-rebuild render), anonymous edit→PR, anonymous Talk/discussion (threaded, topic-organized).
- ✅ Reading core: heading anchors, `[[wikilinks]]` + red links, TOC (active-section + mobile), last-edited line.
- ✅ References/footnotes + citation hover tooltips; captioned figures.
- ✅ Frontmatter layer: infobox, categories (chips + `/category/<tag>`), hatnotes, maintenance banners.
- ✅ Per-section `[edit]` links; live preview; edit-summary; History (`/history` + `/diff`).
- ✅ Moderation: Turnstile, rate-limit, `bans.json`, slug hardening. Foundation: Tailwind tokens + skins, `/pages` manifest.
- ✅ SSR (no client blink): server-rendered content + revision line, red links resolved before paint, clean TOC.
- ✅ Reading UX: collapsible sections, wikilink hover previews, interwiki `[[w:…]]` links, lead-term emphasis, draft persistence.
- ✅ Help namespace (`/help` · editing · formatting); main-menu nav drawer; lazy-loaded Mermaid diagrams.

## Remaining page-level polish (P2)
- ✅ **@mention** linkify · ✅ Named-ref **reuse** + lettered backlinks · ✅ citation templates · ✅ `/design` tokens route

---

# PART II — Beyond the page: autonomous editing, governance & moderation

Research-derived (en.wikipedia.org + mediawiki.org, verified 2024–2025). The owner wants to
**also** offer a Wikipedia-like *autonomous* model (immediate publish + post-hoc moderation),
plus an **owner admin dashboard**. Wikipedia's *default* is immediate-publish; approval-before-display
(Pending Changes) is the selective exception. Today Wikigit is the inverse (every edit is a
reviewed PR). The arc below is: **invert the default, then re-apply review selectively, and give the
owner the console to run it.**

**Architecture mapping in one breath:** most Wikipedia *actions* (move/delete/protect/revert) become
**git ops inside a commit/PR**; most *special pages* become **read-time reports the Worker computes from
the repo tree + git log + parsed `[[links]]`/tags** (cache in KV, recompute on push — no content rebuild);
most *namespaces* become **directory prefixes**; *talk* is **GitHub Discussions**. New state (trust tiers,
filters, watchlists) lives in **KV/D1 bound to the single Worker** — not a second service (invariant holds).

**Two standing privacy invariants (record in SPEC):**
- We store **only an HMAC `ip_hash`, never a raw IP/PII** — *stronger* than Wikipedia, whose 2025
  "Temporary Accounts" still retains IPs for a privileged reveal. So **CheckUser / IP-reveal cannot exist
  here by design**, and **CIDR/range-blocking is impossible** (hashing destroys adjacency). Accept as a
  deliberate cost; lean on PR review + per-hash rate limits + CAPTCHA instead.
- A fixed salt makes `anon-<hash>` **permanently linkable**. Wikipedia rotates temp names ~90 days →
  **evaluate periodic salt/epoch rotation** to cap long-horizon profiling.

## K. Editing model — autonomous publish + post-hoc moderation
| Wikipedia mechanism | Ours (GitHub-backed) | St | Pri |
|---|---|---|---|
| **Immediate publish** (most edits go live instantly) | every edit → PR; trusted tiers **squash-auto-merge** to `main` at once (untrusted wait for review) → live on CDN, no rebuild | ✅ | P0 |
| **Pending Changes / FlaggedRevs** (hold untrusted edits on select pages) | the **current PR-review flow**, but made **per-path** not global (see §L protection) | 🟡 | P0 |
| **Edit conflicts** (base-rev compare → diff3 auto-merge; manual only on overlap) | git's **3-way merge** on the PR auto-resolves non-overlapping edits; an overlapping conflict leaves the PR open in the review queue | ✅ | P1 |
| Edit summary · minor-edit flag | commit message / PR title; `Minor:` trailer or label | 🟡 | P1 |
| **Undo** one edit · **restore to revision** | Worker `POST /restore {slug, rev}` writes the page's content at `rev` (History-row "restore", maintainer); undo-latest = restore the prior row | 🟡 | P1 |
| **Rollback** (1-click revert a contributor's trailing run) | maintainer-gated Worker `POST /rollback` restores each page a commit touched to its pre-commit state (per-commit; trailing-run TODO) | 🟡 | P1 |
| CAPTCHA only for risky/untrusted edits (autoconfirmed exempt) | Turnstile on **anonymous** edits; **any signed-in GitHub user is exempt** (`if (!session)`), not just trusted tiers | 🟡 | P1 |

## L. Trust tiers & page protection (earned autonomy)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Autoconfirmed** (≥10 edits & ≥4 days) | `trust.ts editorTier`: ≥`AUTOCONFIRM_EDITS` (10) accepted commits over ≥`AUTOCONFIRM_DAYS` (4) days → `auto` (auto-merge). Counted from git history per pseudonym — no separate ledger | ✅ | P0 |
| **Extended-confirmed** (≥500 & ≥30 days) | ≥`EXTENDED_EDITS` (500) over ≥`EXTENDED_DAYS` (30) days → `extended` tier for sensitive paths | ✅ | P1 |
| **Autopatrolled / Reviewer / Rollbacker** (human-granted) | maintainer-curated `trusted-editors.json` (+ `REPO_OWNER`) → `maintainer`: auto-merge & approve others; GitHub-team sync still TODO | ✅ | P1 |
| **Protection levels** (semi / extended-confirmed / full / create / move / cascading; temp vs indefinite) | `protection:` frontmatter tier the Worker enforces; set via `POST /protect` + `/admin` Protection tab; `expires` / CODEOWNERS / **full** = branch protection still TODO | 🟡 | P0 |
| Protection edit-notices (`{{pp}}`) | per-path "protected / under review" banner (UI metadata) | ⬜ | P2 |
| *Note:* auto tiers are gameable via IP rotation | keep auto thresholds modest; reserve real power for human-granted tiers | — | — |

## M. Moderation, anti-vandalism & patrol
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **RecentChanges** feed (+ New-Filters: anon/bot/minor/size/namespace/experience/risk) | feed over `git log`/merged PRs; same filter vocabulary as query params | ⬜ | P0 |
| Live patrol stream (EventStreams) | Worker SSE/webhook fan-out of commit/merge events | ⬜ | P2 |
| **Patrol flag / autopatrol**; new pages **noindex** until reviewed | per-edit "reviewed" bit + maintainer **patrol queue**; **autopatrol** = edits at tier ≥ `AUTOPATROL_TIER` (default extended) land pre-patrolled; unpatrolled pages get `noindex` (client island → `GET /patrol-status`, fail-open) | ✅ | P1 |
| **New Pages Patrol** + Page Curation toolbar | New-pages queue (M6) + a **Page Curation toolbar** (`PageCuration`): one maintainer-gated reviewer overlay — approve (patrol) · tag (→ editor) · message author (→ talk) · contributions · roll back · propose-delete, with patrol state + the revert-risk badge inline. Mounts on each New-pages row **and** on any page's read view; optimistic UI over the existing patrol/rollback/delete endpoints (tag/message link to the in-site flows, no new route). Separate file-creation PR queue still TODO | 🟡 | P1 |
| **AbuseFilter** (rules: tag/warn/throttle/disallow/auto-ban, pre-publish) | Worker rule engine over the diff (`filters.json`, CODEOWNERS-gated) — **the workhorse of immediate-publish safety** | ⬜ | P0 |
| Spam/title/link blacklists | versioned blocklist files the Worker checks (refuse spam-domain / bad-title PRs) | ⬜ | P1 |
| Change **tags** (`mw-blank`, `mw-reverted`, mobile…) | filter `tags` (`filters.json`) + `edit-war` (3RR) labels on each change → drive the RC badges/filters | 🟡 | P1 |
| **Revert-risk score** (Lift Wing / language-agnostic model, ~80%) | heuristic 0–100 (`risk.ts`: byte/removal ratio, anon, page-creation, tags) on `/changes` → **high-risk badge + filter**; ML model + link-churn later | 🟡 | P1 |
| **Automoderator / ClueBot** (configurable auto-revert + FP reporting + dashboard) | post-publish: a freshly auto-merged edit scoring ≥ `AUTOMOD_REVERT_SCORE` (off unless set) from a below-`AUTOMOD_EXEMPT_TIER` author is auto-reverted by an `automoderator` bot through the **shared reversible rollback path** (`revertCommit`, a normal commit — never a force-push); a per-page 24 h `AUTOMOD_REVERT_CAP` stops the bot edit-warring; every revert is recorded in `audit-log.jsonl` + an `auto-reverted` tag, with recourse via re-edit/talk and **one-click maintainer undo** in the `/admin` **Automoderator** view. Pure `decideAutoRevert` unit-tested | ✅ | P2 |
| **3RR** (>3 reverts/24h → block) | per-author-per-page 24 h KV counter (`THREE_RR_MAX`, default 3) flags the 4th rapid edit `edit-war` → review badge + risk bump (tag, not block; trusted tiers exempt) | 🟡 | P1 |
| Assisted-revert UI (Twinkle/Huggle/Ultraviolet) | in-site reviewer action menu over Worker endpoints — the **Page Curation toolbar** (row above) already delivers revert (rollback) · propose-delete · message-author · contributions; warn / protect / report still TODO | 🟡 | P2 |
| Maintenance tags → backlog categories | `{{citation needed}}`-style markers → Worker-computed cleanup backlogs | ⬜ | P2 |
| Content **assessment** (Stub→…→GA/FA; ML-predicted) | frontmatter grade + optional quality model; GA = single-reviewer, FA = multi-reviewer sign-off | ⬜ | P2 |

## N. Governance, roles & the **owner admin dashboard**
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Sysop** (block/delete/protect/view-deleted) | **owner dashboard = the sysop console**: `/admin` = recent changes · review · new-pages · rollback/restore · blocks · protection · rights · suppression · audit log | ✅ | P0 |
| **Bureaucrat** (grant rights) / **Steward** | **Rights** tab grants/revokes maintainers via `trusted-editors.json` (`/grant`/`/revoke`); GitHub-team + CODEOWNERS sync still TODO | 🟡 | P1 |
| **Interface-admin** (site JS/CSS is higher-risk than content) | CODEOWNERS-gate Worker/front-end/`filters.json` to a tiny trusted set — treat as strictly more dangerous than content-merge | ⬜ | P1 |
| **Bot account** (flagged, scoped, auditable) | the Worker's authenticated token *is* this — every anon edit attributed through it | ✅ | — |
| **Blocks**: sitewide · **partial** (path/namespace) · IP/range · autoblock | `bans.json` entries via Worker `POST /ban`/`/unban` + `/admin` Blocks tab; site-wide + **path-scoped partial** done; exact-hash only (no range); autoblock implicit (hash = the identity) | ✅ | P1 |
| **Bans** (community vs ArbCom) as decisions enforced by blocks | record *authority/reason* on `bans.json` entries; lightweight Discussion-consensus to authorize | ⬜ | P2 |
| **CheckUser** (IP correlation) | **impossible by design** — exact-`ip_hash` match only; document as intentional | ⊘ | — |
| **Oversight / RevDel / Suppression** (hide revisions even from admins) | `suppressed.json` (author/revision) → Worker **redacts server-side** in `/changes`+`/history` (`Suppression` tab); owner-only **hard-purge** (history rewrite + CDN purge) stays a manual op | 🟡 | P1 |
| **Logs** (block/delete/protect/rights/move/abuse) | git history = most of it **for free**; append-only `audit-log.jsonl` records rollback · restore · protect · delete · grant · revoke · ban · unban · suppress · unsuppress · auto-revert (Audit log tab); a dedicated private suppression log still TODO | 🟡 | P1 |
| Dispute resolution: talk → **RfC** → noticeboards (**ANI/AIV/3RR**) → **ArbCom**; **RfA** | Discussions categories (RfC, incidents, vandalism fast-lane); owner = final authority; future EC-gated grant process | ⬜ | P2 |

## O. Content lifecycle (deletion · move · redirect · merge · drafts)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| Deletion: **CSD** (speedy) · **PROD** (7-day quiet) · **AfD** (discussion) | maintainer **delete** (`POST /delete`, audited) from the New-pages queue = speedy; PROD/AfD-by-PR-policy still TODO | 🟡 | P1 |
| **Undeletion** + deletion log | **restore a pre-deletion revision** from History (git retains content) — no separate endpoint; deletion log = audit log + git | ✅ | P1 |
| **Move/rename** (leaves redirect) | Worker `POST /move`: copies the page to the new path + writes a `#REDIRECT` stub at the old path, **committed directly** (no `git mv`, no PR; old-path history stays at the old path). Tier-gated; 422 if target exists. `/move` form + PageInfo link | ✅ | P1 |
| Move-over-redirect / round-robin / **history-merge** | **dissolved by git** (swap = two `git mv`s; `--follow` preserves attribution); lint copy-paste moves | ⬜ | P2 |
| **Redirects** (`#REDIRECT`); double/broken redirects | `redirect:` frontmatter bounces the reader ("Redirected from" banner, `?redirect=no` to view the stub); link graph flags double/broken chains | ✅ | P1 |
| **Merge / split** (with attribution) | content PR + redirect stub; **attribution is free** in git (no dummy-edit trick); `merged_from:`/`split_from:` frontmatter | ⬜ | P2 |
| **Drafts** / AfC / sandboxes | the open **PR is already the draft**; or a non-indexed `drafts/` tree promoted via `git mv` | 🟡 | P2 |
| **Article/creation wizard** (red link → create) | guided Worker UI pre-filling frontmatter (title, short-desc, infobox skeleton, stub refs) | 🟡 | P1 |

## P. Structure: namespaces · templates · special pages · the link graph
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Namespaces** (Article/Talk/User/Project/Template/Category/File/Help/Draft/Module) | **directory prefixes** (`user/` profiles, `meta/`, `templates/`, `help/`, `drafts/`, `media/`); Talk = Discussions; decide prefix-vs-frontmatter early | 🟡 | P1 |
| **Templates / transclusion** (params, `{{subst:}}`) | `{{slug}}` transcludes a page body, filled from the CDN at read time (no rebuild); recursion-bounded + cycle-safe (`lib/transclude`). Params / `{{subst:}}` still TODO | ✅ | P2 |
| **Navboxes** | author a page as a link grid, transclude it with `{{slug}}` at the bottom of articles | ✅ | P2 |
| **Lua/Scribunto modules**, full parser functions | **out of scope** (conflicts with single-Worker invariant); minimal magic-words only (`noindex`, `notoc`) | ⊘ | — |
| **The link graph** (invert `[[links]]`+includes+tags) | **keystone** — built (`linkgraph.ts` + `/link-graph`): one inverted index drives the special pages (orphaned/wanted/dead-end/double+broken redirects) **and categories** (frontmatter `tags` inverted into a `categories` map) | ✅ | P0 |
| **Special pages**: WhatLinksHere · RecentChanges · Random · Stats · Orphaned · Wanted (=red links) · Dead-end · Double/Broken redirects · Long/Short · MostLinked · AllPages · PageInfo · Categories | Worker-computed from tree + git log + link graph; live in `Special.tsx` + `/search-index` (cache in KV) | ✅ | P1 |
| **Export** | `git clone` **is** the export — already true | ✅ | — |
| **Permalink to a revision** (`oldid`) | route to a page **at a commit SHA** via `?rev=<sha>` (old-revision banner) | ✅ | P1 |
| **Short description** | frontmatter `description:` → search snippets, `<meta>`, hover previews, disambiguation | ✅ | P1 |
| **Citoid** (auto-cite from URL/DOI/ISBN) | Worker `/cite` endpoint (`citelib.ts`): fetch URL/DOI/ISBN → metadata → citation partial — **pure HTTP, no new service** | ✅ | P1 |
| Categories: pages · subcats · hidden/maintenance · **intersection** | tag chips → real category pages, read live from the link-graph index (tags now inverted into a `categories` map; no rebuild): member listing, **subcategory hierarchy** (a member page that is itself a category nests, with parent breadcrumb), **hidden/maintenance** cats split from topical in the chips + on the page, boolean **`/category/a+b` intersection**; plus an All-categories special page (`lib/categories.ts`, unit-tested) | ✅ | P2 |
| Files: description pages + **license** metadata; Commons | sidecar frontmatter per asset (source/author/license); Worker flags unlicensed; shared `media/` (serve binaries from CDN/R2, not git) | ⬜ | P2 |

## Q. Identity, notifications & community (two-tier: anon vs GitHub account)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Temporary Accounts** (`~2025-NNN`, IP masked, 90-day) | our `anon-<hash>` is the precedent realized **more privately** (no reveal tier); show pseudonym in history/talk | ✅ | — |
| Account login (optional) / SUL / 2FA / OAuth | **offload entirely to GitHub** ("Sign in with GitHub"); no own credential store | ⬜ | P2 |
| **User contributions** (per-user history) | Worker `GET /contributions?author=` (full per-author history from git, KV-cached, static fallback) → profile panel for logins; anon uses the `/changes?author=` recent-window filter | ✅ | P1 |
| **Watchlist** + **Echo notifications** (pings, reverts, thanks) | **account-path only** (needs durable, reachable identity): GitHub watch/subscribe + native @mention/reaction/email; anon has no inbox by design | ⬜ | P2 |
| **Thanks** / reactions · barnstars/WikiLove | GitHub reactions on commit/PR/Discussion; kudos templated post (account path) | ⬜ | P2 |
| **Pageview analytics** ("watched by N", with privacy threshold) | edge-counted per-path views (privacy-safe, no identity); apply min-count threshold | ⬜ | P2 |
| Appearance (dark mode) for **logged-out** readers | already have skins+theme via cookie/localStorage — keep anon-accessible | ✅ | — |
| Community spaces: Village Pump · Teahouse · WikiProjects | pinned **Discussions categories** (Policy/Proposals/Technical/Help) | 🟡 | P2 |
| Growth: newcomer homepage · **structured "Add a Link" tasks** · guided tours · mentorship | guided onboarding tour + structured micro-edits (anon-friendly → small PRs); homepage/mentorship are account-path | ⬜ | P2 |

### The "autonomous mode" critical path (smallest set to flip the default safely)
1. **Auto-merge** path (§K) — every edit is a PR; trusted tiers merge at once — the core flip. ✅
2. **`protection.json` per-path tiers** + CODEOWNERS (§L) — make review *selective*.
3. **Trust ledger on `ip_hash`** (autoconfirmed analog, §L) — earned autonomy. *Highest leverage.*
4. **AbuseFilter-style Worker rules + per-hash rate limits** (§M) — pre-publish safety net.
5. **RecentChanges feed + patrol queue + `noindex`-until-patrolled** (§M) — post-hoc moderation surface.
6. **Rollback/undo/restore + `bans.json` partial blocks** (§K/§N) — fast cleanup, all in the **owner dashboard** (§N).

---

# PART III — Spotted-in-build backlog (2026-06-05)

Items the owner caught while using the in-progress build. Type: 🐛 bug · ✨ enhancement · ❓ decision.
Cross-refs point at the relevant A–Q row so we extend, not duplicate.

## R. Rendering & SSR (no client blink)
| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| R1 | **No client-side lazy loading for content.** Content/layout must arrive server-rendered — no blink, no incomplete layout while data fills in. Treat this as a hard rule for content pages. | 🐛 | ✅ | P0 | invariant |
| R2 | **Revision info loads client-side** → fix to render server-side (it's a content surface, not an interaction). `PageMeta` now SSRs from build-time `gitRevisions` as `initialValue`. `0e878f4` | 🐛 | ✅ | P0 | §F |
| R3 | **Red link flashes blue before turning red** — link color is resolved client-side; resolve missing-target state at render so it's red on first paint. Build bakes `is-red`; client paths resolve before `setHtml`. `07d82b2` | 🐛 | ✅ | P0 | §D |
| R4 | **Logged-in (GitHub) state blinks on load** — personal-tools / auth UI is resolved client-side, so the header flashes signed-out → signed-in on every paint. Resolve the session at render (server-side, or from a cookie before first paint) so the correct signed-in chrome shows immediately, no blink. `AuthButton` now resolves from sync session + cached enabled flag (no network gate); `9b9e543` | 🐛 | ✅ | P0 | §A, R1 |

## S. Reading layout
| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| S1 | **TOC includes the per-section `[edit]` text** from the heading; TOC entries must be the section title only. `0e878f4` | 🐛 | ✅ | P0 | §C |
| S2 | **Collapsible sections** (Wikipedia-style show/hide per heading). `makeSectionsCollapsible` in `lib/decorate`. | ✨ | ✅ | P1 | §C |
| S3 | **Third column (`col-info`→`Infobox.tsx`).** The custom `infobox:` mode stays; **kill the auto-generated fallback panel** (Type/Rendering/Editing/Revisions/Last-edit/Source/License) — it's platform-meta, duplicates footer §E + history §F, and its `getHistory`/`onMount` fetches cause the R2 client blink. **Decision (a):** keep facts in frontmatter, add an **inline infobox editor in the edit flow** (edit rows like the body, not raw YAML). Done: `Infobox` renders **only** with a custom `infobox:` (`Show when rows>0`) — the auto fallback panel + its `getHistory` fetch are gone; the only `onMount` is a light frontmatter re-read; the editor's properties form is the inline editor. | ✨ | ✅ | P1 | §D, R2 |
| S4 | **What is the breadcrumb for?** Decide its purpose or remove it. Resolved: no breadcrumb exists in the codebase — nothing to keep or remove. | ❓ | ✅ | P2 | §J |
| S5 | **Interwiki link type** — a *third* link class beside internal `[[Page]]` and plain external links: a link that resolves to an **existing Wikipedia article** so we don't maintain a page for well-covered topics. Distinct visual treatment (e.g. W badge / outbound marker) so readers see it leaves the wiki; **documented as a Wikipedia-style interwiki link**. Proposed syntax: `[[w:Title]]` / `[[wikipedia:Title]]` → `en.wikipedia.org/wiki/Title`. Ex: homepage *CDN* → Wikipedia's *Content delivery network*. Open Qs: prefix set (`w:` only, or more wikis later?) and whether to existence-check the target. Shipped: `[[w:Title]]`/`[[wikipedia:Title]]` → Wikipedia, `.interwiki` badge. `0e878f4` | ✨ | ✅ | P1 | §B, §D, T4 |
| S6 | **Reading-position restore animates from the top** — on refresh the page loads at the top, then scrolls down to the saved reading position. Restore the scroll **synchronously before first paint** (no smooth-scroll) so it opens directly at the saved spot. Gated `scroll-behavior: smooth` behind `.ready` so the browser's restore is instant; `87be78e` | 🐛 | ✅ | P1 | §C |
| S7 | **`getting-started` shifts the column layout** — its body is too narrow to fill the content column, so the grid collapses to a different layout than other pages. The column geometry must stay **constant regardless of content width**. Likely downstream: the **info card is mispositioned** because the column widths changed (fix S7's width and the card should fall back into place). Fixed: `width: 100%` on `.read-grid`/`.view-wrap` (auto flex-margins were cancelling the stretch) + `230px minmax(0,1fr) 260px` columns; `a91e98d` | 🐛 | ✅ | P1 | §D, S3 |

## T. Editing
| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| T1 | **Hide Turnstile from the user** — keep anti-bot under the hood; on failure print an error; if not yet verified, hold the submission in a waiting state rather than exposing the widget. | 🐛/✨ | ✅ | P0 | §G, §M |
| T2 | **Refresh on the edit page wipes the content** — persist the draft (local/session) across reloads. `lib/draft` restores on mount, persists on change, clears on submit. | 🐛 | ✅ | P0 | §G |
| T3 | **Hatnote shows as raw markdown in the editor** — preview the hat correctly (rendered), don't surface it inline in the md. Hatnote is a `PageProperties` field; the preview renders the body only (frontmatter split off). | 🐛 | ✅ | P1 | §D |
| T4 | **Help/docs pages** (own namespace): how it works, how to contribute, a markdown primer for non-technical editors, and a reference of available md plugins + their syntax — surfaced near the editor. Shipped `help/` (index · editing · formatting) + editor hint. `2cc750d` | ✨ | ✅ | P1 | §P (help/ ns) |
| T5 | **More markdown plugins** — evaluate e.g. **Mermaid** for technical diagrams; list candidates. Mermaid shipped, lazy-loaded (dynamic import, own chunk), strict security level. `0ac3e86` | ✨ | ✅ | P2 | §D |

## U. Talk & profiles
| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| U1 | **Opening a thread blinks** — the whole component flashes before rendering/expanding; fix the mount/transition. Delayed-skeleton (160ms) + gated expand + ease-in; cached re-opens instant. `f7d3d50` | 🐛 | ✅ | P1 | §I |
| U2 | **Reactions on talk comments.** | ✨ | ⬜ | P2 | §I, §Q |
| U3 | **Profile page** (Wikipedia user-page equivalent) — `/user/<login>`, **GitHub-signed-in users only** (an `ip_hash` can't prove ownership, so anon ids get a soft "no profile" note pointing at their contributions filter). The page is an ordinary Markdown page in a `user/` namespace edited through the exact same edit/PR/trust/Turnstile pipeline — **owner-only** (the signed-in login matching the slug; not even maintainers edit profile content — they moderate via delete/rollback), owner publishes live. The Edit tab/create-invite/editor are hidden or refused for non-owners (a client mirror of the server 403). Beside it, an auto-rendered **contributions + trust-tier** panel (Worker `GET /contributions?author=`, KV-cached, static-manifest fallback) reusing the /changes shape. `@login` mentions now resolve in-site to the profile. | ✨ | ✅ | P2 | §Q |

## V. History / revisions UX
| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| V1 | **Richer, friendlier revision page** — 2-column side-by-side change view with line numbers, word-level highlights, an add/remove legend, and a split/unified toggle (`DiffView`); revision rows tidied with Wikipedia-style older/newer **compare-any-two** radios + a "Compare selected" button alongside the cur/prev quick links, and a permalink footer on the diff. Polish: collapsed context runs expand in place, the permalink has a copy button, and rows support ↑/↓/Enter keyboard nav. | ✨ | ✅ | P1 | §F |

## W. Header & top-of-page chrome (Vector 2022 layout)
Owner ref (screenshot): title left + **languages** button top-right; below, a tab strip with **Article · Discussion left-aligned** and **Read · Edit · History · Tools right-aligned** on the same row.

| # | Item | Type | St | Pri | Ref |
|---|---|---|---|---|---|
| W1 | **Header is packed to the left** instead of spanning the bar — wordmark / search / personal-tools should distribute across the available width (justify the bar, don't bunch everything at the start). Fixed: search is a fixed-basis flex item with auto inline margins, so it centres between the wordmark cluster (left) and personal tools (right) and the bar spans full width. `8bb15f8` | 🐛 | ✅ | P1 | §A |
| W2 | **Split the tab strip like Vector 2022** — namespace tabs (**Article · Discussion**) left-aligned; view/tool actions (**Read · Edit · History · Tools**) right-aligned, same row. Shipped: `.tabbar` is two `space-between` groups; **Tools** is a native `<details>` dropdown (SSR, no JS, no blink) of per-page tools (what-links-here · page info · cite · move · source); mirrored in the `Route404` SPA fallback; mobile wraps the two groups to stacked rows (also unclips the dropdown). Appearance stays the Vector-faithful right-rail sidebar panel (where real Vector 2022 puts it), not the row. `8bb15f8` | ✨ | ✅ | P1 | §B, §J |
| W3 | **Interlanguage switcher** ("N languages", like Wikipedia's *209 langues*) — switch between language **versions of the same article**. Distinct from interwiki links (S5, which leave for Wikipedia): this is the same topic in another language, hosted by us. **Done → SPEC M8.** Translations are **independent pages** linked by a low-cost frontmatter `translationKey`; **default language languageless** (bare slugs), other langs URL-prefixed + localized (`/fr/cafe`). SSR `LangBar` switcher (no blink) + `<html lang>` + hreflang; **language-aware wikilinks**, **per-language home** (`/fr`), **live grouping** via the Worker index, and **"translate this page"** for missing languages. | ✨ | ✅ | P1 | §B, S5 |
