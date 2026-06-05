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
(Editorial / Vector) × light/dark, semantic roles only.

| Feature | St | Pri |
|---|---|---|
| Tailwind + centralized tokens (design `tokens.css`) | ✅ | P0 |
| Light / dark mode | ✅ | P0 |
| Swappable skins (Editorial / Vector) | ✅ | P1 |
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
- ✅ Read path (no-rebuild render), anonymous edit→PR, anonymous Talk/discussion.
- ✅ Moderation: Turnstile, rate-limit, bans, slug hardening.
- ✅ Foundation: Tailwind + theme tokens; **page manifest** (`/pages`).

## Next build order (design-independent first, styled when the design lands)
1. ✅ **Reading core:** heading anchors, **`[[wikilinks]]` + red links**, **TOC** (active-section
   highlight), **"last edited by `anon-<hash>`"** line.
2. ✅ **History:** Worker `/history` + `/diff` → revision list (cur/prev diffs) + colored diff view.
3. **Editor DX (P0, next):** live preview, edit-summary field, create-page polish.
4. **Then:** section edit, references, infobox, search, categories, Talk threading, skins.
