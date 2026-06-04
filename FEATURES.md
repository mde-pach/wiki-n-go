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
| Wikipedia | Ours | St | Pri |
|---|---|---|---|
| Revision list (date · author · summary) | `git log` for the file (Worker `/history`) (★) | ⬜ | P0 |
| Pick-two diff (add/remove coloring) | GitHub compare/commit → rendered diff (★) | ⬜ | P0 |
| Permalink to a revision | jsDelivr `@<sha>` (★) | ⬜ | P1 |
| Revert a revision | resubmit prior content as an anon edit (⚒) | ⬜ | P1 |
| Per-line blame | GraphQL `blame` (★) | ⬜ | P2 |

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
| Feature | St | Pri |
|---|---|---|
| Tailwind + centralized tokens (light/dark) | ✅ | P0 |
| Theme toggle UI (`data-theme`) | ⬜ | P0 |
| Width control (Standard/Wide) | ⬜ | P1 |
| Swappable skins (token presets) | ⬜ | P1 |
| Config-/frontmatter-driven theming | ⬜ | P1 |

---

## Already shipped (data + plumbing)
- ✅ Read path (no-rebuild render), anonymous edit→PR, anonymous Talk/discussion.
- ✅ Moderation: Turnstile, rate-limit, bans, slug hardening.
- ✅ Foundation: Tailwind + theme tokens; **page manifest** (`/pages`).

## Next build order (design-independent first, styled when the design lands)
1. **Reading core (P0):** heading anchors + **TOC**, **`[[wikilinks]]` + red links**, "last edited" line.
2. **History (P0, cheap):** Worker `/history` + `/diff` → revision list + diff view.
3. **Editor DX (P0):** live preview, edit-summary field, create-page polish.
4. **Then:** section edit, references, infobox, search, categories, skins.
