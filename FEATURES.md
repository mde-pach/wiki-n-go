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
| **Search box** (full-text) | search over the manifest/content (⚒) | ⬜ | P1 |
| Main-menu button (nav drawer) | configurable sidebar/nav (⚒) | ⬜ | P1 |
| Personal tools (login/donate/account) | optional GitHub sign-in only; no login wall | ⬜ | P2 |
| "Jump to content" skip link | a11y skip link | ⬜ | P1 |

## B. Page header (title + action bars)
Sits above the article: title, the two tab rows, page tools, appearance, languages.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| `h1` page title | page title from H1/frontmatter | 🟡 | P0 |
| **Namespaces tabs**: Article · Talk | tabs: Read · **Talk** (our discussion) | 🟡 | P0 |
| **Views tabs**: Read · Edit · View history | tabs: Read · **Edit** · **History** | 🟡 | P0 |
| **Page tools**: what-links-here, permanent link, page info, cite | permalink (jsDelivr@sha ★), backlinks (manifest ⚒), page info ★, cite ⚒ | ⬜ | P1 |
| **Appearance**: text size · width · color theme | our **theme tokens** (light/dark/width) — direct analog | 🟡 | P1 |
| Languages (interwiki) | n/a v1 | ⬜ | — |
| "From … / tagline" | optional subtitle | ⬜ | P2 |

## C. Table of Contents (`navigation "Contents"`)
A sticky, collapsible, nested sidebar auto-built from headings.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Auto TOC from heading tree | build TOC from rendered headings (⚒) | ⬜ | P0 |
| Sticky + active-section highlight on scroll | IntersectionObserver (⚒) | ⬜ | P1 |
| Collapse / hide; mobile drawer | responsive behavior (⚒) | ⬜ | P1 |

## D. Article body (`main` content)
The core, in render order observed on the page.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| **Hatnotes** ("This article is about… For…") | frontmatter/markdown admonition (⚒) | ⬜ | P2 |
| **Maintenance banners** ("needs additional citations") | status banners from frontmatter (⚒) | ⬜ | P2 |
| **Lead section** (bold title term, summary) | first block before H1-sub; bold term | ⬜ | P1 |
| **Infobox** (fact panel, floats top-right) | frontmatter-driven; float desktop / stack mobile (⚒) | ⬜ | P1 |
| **Section headings** + `#` anchors | slugged headings, hover anchor (⚒) | ⬜ | P0 |
| **Per-section `[edit]`** links | split markdown by heading, edit one (⚒) | ⬜ | P1 |
| **Figures** (images + captions) | markdown images + `<figure>` caption (⚒) | ⬜ | P1 |
| **Blockquotes / tables** | markdown native | ✅ | P0 |
| **References / footnotes** `[1]` + reflist + backlinks | markdown-it footnotes (⚒) | ⬜ | P1 |
| Reference **tooltips** on hover | popover on citation marker (⚒) | ⬜ | P2 |
| **Internal links `[[Page]]`** + **red links** | rewrite via manifest; red = missing (⚒) | ⬜ | P0 |
| **Hover page previews** | popup card on internal link (⚒) | ⬜ | P2 |
| **See also / External links** sections | markdown convention | ✅ | P1 |
| **Navboxes** (bottom template grids) | transclusion/includes (⚒) | ⬜ | P2 |
| **Categories** footer | frontmatter `tags` → `/category/<x>` (⚒) | ⬜ | P1 |
| Authority/Wikidata strip | n/a → **"view source on GitHub"** provenance | ⬜ | P2 |

## E. Footer (`contentinfo`)
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| "**Last edited** on `<date>`" | "last edited by `anon-<hash>` · `<date>`" from git (★) | ⬜ | P0 |
| License / terms / trademark | configurable license + provenance line | ⬜ | P1 |
| Mobile view toggle | responsive (no separate view) | — | — |

## F. History & revisions (git = our superpower)
Observed on `?action=history`: each row has cur/prev diff links, two compare
radios, timestamp→revision, author + talk + contribs, byte size + delta, summary,
and undo/thank/tag actions; Newer/Older pagination.

| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Revision list: date · author · **summary** · **size + byte delta** | `git log` w/ stats (Worker `/history`) (★) | ⬜ | P0 |
| Per-row **cur / prev** diff links | diff vs latest / previous (★) | ⬜ | P0 |
| **Compare any two** (radio select) | pick-two → `/diff?from&to` (★) | ⬜ | P0 |
| Diff render (add/remove coloring) | GitHub compare/commit patch → render (★) | ⬜ | P0 |
| Permalink to a revision | jsDelivr `@<sha>` (★) | ⬜ | P1 |
| **Undo / revert** a revision | resubmit prior content as an anon edit→PR (⚒) | ⬜ | P1 |
| Pagination (Newer/Older) | paginate commits (★) | ⬜ | P2 |
| Per-line blame | GraphQL `blame` (★) | ⬜ | P2 |
| "Thank" an edit | n/a (maybe a 👍 reaction) | ⬜ | — |

## G. Editing flow
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| In-page editor | textarea editor → PR | ✅ | P0 |
| Edit summary | Worker param; surface field (★) | 🟡 | P0 |
| **Live preview** | reuse renderer beside textarea (⚒) | ⬜ | P0 |
| Section editing | edit one section (⚒) | ⬜ | P1 |
| Create-new-page (red link → create) | Worker already creates new files (★) | 🟡 | P0 |
| Show diff before submit | diff draft vs current (⚒) | ⬜ | P1 |
| Edit-conflict detection | base-SHA check in Worker (⚒) | ⬜ | P1 |
| Anti-bot (already have) | Turnstile | ✅ | — |

## H. Theming / appearance (our "Appearance" menu)
Design token system adopted from `.design/` (single source of truth): two skins
(Wiki-n-go / Wiki) × light/dark, semantic roles only. The **Wiki** skin is a
near 1:1 replica of Wikipedia (Vector 2022 / Codex tokens).

| Feature | St | Pri |
|---|---|---|
| Tailwind + centralized tokens (design `tokens.css`) | ✅ | P0 |
| Light / dark mode | ✅ | P0 |
| Swappable skins (Wiki-n-go / Wiki) | ✅ | P1 |
| Theme + skin toggle (temporary; final UI in chrome port) | 🟡 | P0 |
| Width control (Standard/Wide) | ⬜ | P1 |
| Config-/frontmatter-driven theming | ⬜ | P1 |

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
| Per-topic metadata (last-comment age · #comments · #participants) | reply count + last-activity age (participants deferred) | 🟡 | P2 |
| **Arbitrary-depth replies** (indentation) | reply-to marker → client-rebuilt tree | ✅ | P1 |
| Per-comment **reply** button + more menu | reply box under each comment (more-menu deferred) | 🟡 | P1 |
| **Signature**: author · timestamp · **comment permalink** | author + relative time + per-comment permalink | ✅ | P1 |
| **@mentions** of contributors | parse + link (anon handle / GitHub user) (⚒) | ⬜ | P2 |
| Talk header / guidelines banner | config/frontmatter (⚒) | ⬜ | P2 |
| Unsigned-comment attribution | n/a — we always stamp the author | ✅ | — |
| Archives, WikiProject/assessment, find-sources | Wikipedia-specific | ⊘ | — |

## J. Cross-page chrome (seen on every namespace)
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Same header/footer/TOC/appearance on Article, Talk, History | one shared layout across all page types | 🟡 | P0 |
| Namespace tabs adapt (Article↔Talk, Read/Edit/History) | tab bar reflects current view | ⬜ | P0 |
| User links: profile · **talk** · **contributions** | for GitHub users: profile/commits; for anon: filter-by-`anon-<hash>` | ⬜ | P2 |

---

## Already shipped (data + plumbing)
- ✅ Read path (no-rebuild render), anonymous edit→PR, anonymous Talk/discussion (threaded, topic-organized).
- ✅ Reading core: heading anchors, `[[wikilinks]]` + red links, TOC (active-section + mobile), last-edited line.
- ✅ References/footnotes + citation hover tooltips; captioned figures.
- ✅ Frontmatter layer: infobox, categories (chips + `/category/<tag>`), hatnotes, maintenance banners.
- ✅ Per-section `[edit]` links; live preview; edit-summary; History (`/history` + `/diff`).
- ✅ Moderation: Turnstile, rate-limit, `bans.json`, slug hardening. Foundation: Tailwind tokens + skins, `/pages` manifest.

## Remaining page-level polish (P2)
- ⬜ Lead-section emphasis / bold title term · ⬜ wikilink **hover page previews** · ⬜ Talk **@mention** linkify
- ⬜ Named-ref **reuse** + grouped notes · ⬜ citation templates · ⬜ richer full-text search · ⬜ `/design` tokens route

---

# PART II — Beyond the page: autonomous editing, governance & moderation

Research-derived (en.wikipedia.org + mediawiki.org, verified 2024–2025). The owner wants to
**also** offer a Wikipedia-like *autonomous* model (immediate publish + post-hoc moderation),
plus an **owner admin dashboard**. Wikipedia's *default* is immediate-publish; approval-before-display
(Pending Changes) is the selective exception. Today wiki-n-go is the inverse (every edit is a
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
| **Immediate publish** (most edits go live instantly) | Worker **direct-commit / auto-merge** path to `main` → live on CDN (purge jsDelivr on commit) | ⬜ | P0 |
| **Pending Changes / FlaggedRevs** (hold untrusted edits on select pages) | the **current PR-review flow**, but made **per-path** not global (see §L protection) | 🟡 | P0 |
| **Edit conflicts** (base-rev compare → diff3 auto-merge; manual only on overlap) | capture **base commit SHA**; 3-way merge onto `main`; conflict view only on overlapping hunks | ⬜ | P1 |
| Edit summary · minor-edit flag | commit message / PR title; `Minor:` trailer or label | 🟡 | P1 |
| **Undo** one edit · **restore to revision** | Worker `POST /restore {slug, rev}` writes the page's content at `rev` (History-row "restore", maintainer); undo-latest = restore the prior row | 🟡 | P1 |
| **Rollback** (1-click revert a contributor's trailing run) | maintainer-gated Worker `POST /rollback` restores each page a commit touched to its pre-commit state (per-commit; trailing-run TODO) | 🟡 | P1 |
| CAPTCHA only for risky/untrusted edits (autoconfirmed exempt) | Turnstile on untrusted `ip_hash` / external-link adds; **exempt trusted tiers** | 🟡 | P1 |

## L. Trust tiers & page protection (earned autonomy)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Autoconfirmed** (≥10 edits & ≥4 days) | Worker **trust ledger** on `ip_hash`: N clean merged edits over M days → flips to auto-merge | ⬜ | P0 |
| **Extended-confirmed** (≥500 & ≥30 days) | higher tier unlocking sensitive paths | ⬜ | P1 |
| **Autopatrolled / Reviewer / Rollbacker** (human-granted) | maintainer-curated `trusted-editors.json` / GitHub team → auto-merge & approve others | ⬜ | P1 |
| **Protection levels** (semi / extended-confirmed / full / create / move / cascading; temp vs indefinite) | `protection:` frontmatter tier the Worker enforces; set via `POST /protect` + `/admin` Protection tab; `expires` / CODEOWNERS / **full** = branch protection still TODO | 🟡 | P0 |
| Protection edit-notices (`{{pp}}`) | per-path "protected / under review" banner (UI metadata) | ⬜ | P2 |
| *Note:* auto tiers are gameable via IP rotation | keep auto thresholds modest; reserve real power for human-granted tiers | — | — |

## M. Moderation, anti-vandalism & patrol
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **RecentChanges** feed (+ New-Filters: anon/bot/minor/size/namespace/experience/risk) | feed over `git log`/merged PRs; same filter vocabulary as query params | ⬜ | P0 |
| Live patrol stream (EventStreams) | Worker SSE/webhook fan-out of commit/merge events | ⬜ | P2 |
| **Patrol flag / autopatrol**; new pages **noindex** until reviewed | per-edit "reviewed" bit + maintainer **patrol queue**; unpatrolled pages get `noindex` (client island → `GET /patrol-status`, fail-open) | ✅ | P1 |
| **New Pages Patrol** + Page Curation toolbar | separate queue for *file-creation* PRs; reviewer overlay (approve / tag / propose-delete / message author) | ⬜ | P1 |
| **AbuseFilter** (rules: tag/warn/throttle/disallow/auto-ban, pre-publish) | Worker rule engine over the diff (`filters.json`, CODEOWNERS-gated) — **the workhorse of immediate-publish safety** | ⬜ | P0 |
| Spam/title/link blacklists | versioned blocklist files the Worker checks (refuse spam-domain / bad-title PRs) | ⬜ | P1 |
| Change **tags** (`mw-blank`, `mw-reverted`, mobile…) | auto-label edits at ingest (new-page, blanking, large-removal, revert, source) → drive RC filters | ⬜ | P1 |
| **Revert-risk score** (Lift Wing / language-agnostic model, ~80%) | per-diff risk score (heuristics → model): byte/removal ratio, link churn, hash history → gates autopatrol & auto-revert | ⬜ | P1 |
| **Automoderator / ClueBot** (configurable auto-revert + FP reporting + dashboard) | bot identity auto-reverts high-confidence vandalism; threshold config, trusted allowlist, FP-report Discussion, per-page revert cap | ⬜ | P2 |
| **3RR** (>3 reverts/24h → block) | Worker detects revert-churn per `ip_hash`/path → throttle / flag / temp-ban | ⬜ | P1 |
| Assisted-revert UI (Twinkle/Huggle/Ultraviolet) | in-site reviewer action menu (revert · warn · propose-delete · protect · report) over Worker endpoints | ⬜ | P2 |
| Maintenance tags → backlog categories | `{{citation needed}}`-style markers → Worker-computed cleanup backlogs | ⬜ | P2 |
| Content **assessment** (Stub→…→GA/FA; ML-predicted) | frontmatter grade + optional quality model; GA = single-reviewer, FA = multi-reviewer sign-off | ⬜ | P2 |

## N. Governance, roles & the **owner admin dashboard**
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Sysop** (block/delete/protect/view-deleted) | **owner dashboard = the sysop console**: `/admin` aggregates recent changes + review queue + 1-click rollback + **blocks editor** + **audit log**; protection editing + view-deleted TODO | 🟡 | P0 |
| **Bureaucrat** (grant rights) / **Steward** | owner manages GitHub team + CODEOWNERS (dashboard "grant reviewer") | 🟡 | P1 |
| **Interface-admin** (site JS/CSS is higher-risk than content) | CODEOWNERS-gate Worker/front-end/`filters.json` to a tiny trusted set — treat as strictly more dangerous than content-merge | ⬜ | P1 |
| **Bot account** (flagged, scoped, auditable) | the Worker's authenticated token *is* this — every anon edit attributed through it | ✅ | — |
| **Blocks**: sitewide · **partial** (path/namespace) · IP/range · autoblock | `bans.json` entries via Worker `POST /ban`/`/unban` + `/admin` Blocks tab; site-wide + **path-scoped partial** done; exact-hash only (no range); autoblock implicit (hash = the identity) | ✅ | P1 |
| **Bans** (community vs ArbCom) as decisions enforced by blocks | record *authority/reason* on `bans.json` entries; lightweight Discussion-consensus to authorize | ⬜ | P2 |
| **CheckUser** (IP correlation) | **impossible by design** — exact-`ip_hash` match only; document as intentional | ⊘ | — |
| **Oversight / RevDel / Suppression** (hide revisions even from admins) | render-time **redaction layer** (hide diff/summary/author) + owner-only **hard-purge** (history rewrite + CDN purge + delete source PR/Discussion) — the one place the no-rebuild invariant bends | ⬜ | P1 |
| **Logs** (block/delete/protect/rights/move/abuse) | git history = most of it **for free**; append-only `audit-log.jsonl` records rollback/ban/unban (Audit log tab); private suppression log still TODO | 🟡 | P1 |
| Dispute resolution: talk → **RfC** → noticeboards (**ANI/AIV/3RR**) → **ArbCom**; **RfA** | Discussions categories (RfC, incidents, vandalism fast-lane); owner = final authority; future EC-gated grant process | ⬜ | P2 |

## O. Content lifecycle (deletion · move · redirect · merge · drafts)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| Deletion: **CSD** (speedy) · **PROD** (7-day quiet) · **AfD** (discussion) | all = a **delete PR**, differing by *who merges* + *wait*: fast-merge label / 7-day auto-merge-unless-objected / Discussion consensus | ⬜ | P1 |
| **Undeletion** + deletion log | restore from git (`git checkout <sha>^ -- path`) — **trivial advantage**; log = merged delete PRs | ⬜ | P1 |
| **Move/rename** (leaves redirect; history follows) | `git mv` in a PR — history follows **natively**; write a redirect stub at the old path | 🟡 | P1 |
| Move-over-redirect / round-robin / **history-merge** | **dissolved by git** (swap = two `git mv`s; `--follow` preserves attribution); lint copy-paste moves | ⬜ | P2 |
| **Redirects** (`#REDIRECT`); double/broken redirects | redirect frontmatter the Worker honors; reports flag chains>1 & missing targets (auto-fix doubles) | ⬜ | P1 |
| **Merge / split** (with attribution) | content PR + redirect stub; **attribution is free** in git (no dummy-edit trick); `merged_from:`/`split_from:` frontmatter | ⬜ | P2 |
| **Drafts** / AfC / sandboxes | the open **PR is already the draft**; or a non-indexed `drafts/` tree promoted via `git mv` | 🟡 | P2 |
| **Article/creation wizard** (red link → create) | guided Worker UI pre-filling frontmatter (title, short-desc, infobox skeleton, stub refs) | 🟡 | P1 |

## P. Structure: namespaces · templates · special pages · the link graph
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Namespaces** (Article/Talk/User/Project/Template/Category/File/Help/Draft/Module) | **directory prefixes** (`meta/`, `templates/`, `help/`, `drafts/`, `media/`); Talk = Discussions; decide prefix-vs-frontmatter early | 🟡 | P1 |
| **Templates / transclusion** (params, `{{subst:}}`) | Markdown **partials/includes** resolved by the Worker; infobox/banners already are templates | 🟡 | P2 |
| **Navboxes** | bottom link-grid partial driven by a shared data file | ⬜ | P2 |
| **Lua/Scribunto modules**, full parser functions | **out of scope** (conflicts with single-Worker invariant); minimal magic-words only (`noindex`, `notoc`) | ⊘ | — |
| **The link graph** (invert `[[links]]`+includes+tags) | **keystone** — one inverted index unlocks ~10 special pages | ⬜ | P0 |
| **Special pages**: WhatLinksHere · RecentChanges · Random · Stats · Orphaned · Wanted (=red links) · Dead-end · Double/Broken redirects · Long/Short · MostLinked · AllPages · PageInfo | Worker-computed from tree + git log + link graph (cache in KV; recompute on push) | ⬜ | P1 |
| **Export** | `git clone` **is** the export — already true | ✅ | — |
| **Permalink to a revision** (`oldid`) | route to a page **at a commit SHA** (`/page@<sha>`) | 🟡 | P1 |
| **Short description** | frontmatter `description:` → search snippets, `<meta>`, hover previews, disambiguation | ⬜ | P1 |
| **Citoid** (auto-cite from URL/DOI/ISBN) | Worker endpoint: fetch URL/DOI/ISBN → metadata → citation partial — **high ROI, pure HTTP, no new service** | ⬜ | P1 |
| Categories: pages · subcats · hidden/maintenance · **intersection** | already have tag chips + `/category`; add member pages, hierarchy, hidden cats, boolean tag intersection | 🟡 | P2 |
| Files: description pages + **license** metadata; Commons | sidecar frontmatter per asset (source/author/license); Worker flags unlicensed; shared `media/` (serve binaries from CDN/R2, not git) | ⬜ | P2 |

## Q. Identity, notifications & community (two-tier: anon vs GitHub account)
| Wikipedia mechanism | Ours | St | Pri |
|---|---|---|---|
| **Temporary Accounts** (`~2025-NNN`, IP masked, 90-day) | our `anon-<hash>` is the precedent realized **more privately** (no reveal tier); show pseudonym in history/talk | ✅ | — |
| Account login (optional) / SUL / 2FA / OAuth | **offload entirely to GitHub** ("Sign in with GitHub"); no own credential store | ⬜ | P2 |
| **User contributions** (per-user history) | filter git log / PRs by author (GitHub handle or `anon-<hash>`) | ⬜ | P1 |
| **Watchlist** + **Echo notifications** (pings, reverts, thanks) | **account-path only** (needs durable, reachable identity): GitHub watch/subscribe + native @mention/reaction/email; anon has no inbox by design | ⬜ | P2 |
| **Thanks** / reactions · barnstars/WikiLove | GitHub reactions on commit/PR/Discussion; kudos templated post (account path) | ⬜ | P2 |
| **Pageview analytics** ("watched by N", with privacy threshold) | edge-counted per-path views (privacy-safe, no identity); apply min-count threshold | ⬜ | P2 |
| Appearance (dark mode) for **logged-out** readers | already have skins+theme via cookie/localStorage — keep anon-accessible | ✅ | — |
| Community spaces: Village Pump · Teahouse · WikiProjects | pinned **Discussions categories** (Policy/Proposals/Technical/Help) | 🟡 | P2 |
| Growth: newcomer homepage · **structured "Add a Link" tasks** · guided tours · mentorship | guided onboarding tour + structured micro-edits (anon-friendly → small PRs); homepage/mentorship are account-path | ⬜ | P2 |

### The "autonomous mode" critical path (smallest set to flip the default safely)
1. **Direct-commit/auto-merge** path (§K) + jsDelivr purge — the core flip.
2. **`protection.json` per-path tiers** + CODEOWNERS (§L) — make review *selective*.
3. **Trust ledger on `ip_hash`** (autoconfirmed analog, §L) — earned autonomy. *Highest leverage.*
4. **AbuseFilter-style Worker rules + per-hash rate limits** (§M) — pre-publish safety net.
5. **RecentChanges feed + patrol queue + `noindex`-until-patrolled** (§M) — post-hoc moderation surface.
6. **Rollback/undo/restore + `bans.json` partial blocks** (§K/§N) — fast cleanup, all in the **owner dashboard** (§N).
