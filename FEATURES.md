# FEATURES — Page experience (Wikipedia-style)

Target: Wikipedia/Wikimedia-grade page UX on our stack (git-backed, no account,
no rebuild). This doc enumerates per-page features + editor DX, mapped to our
architecture, with priority tiers. Theming is a parallel workstream (§6).

Legend — effort: **★ cheap** (mostly free from git/GitHub) · **⚒ build** ·
**⊘ deferred** (needs the GitHub-account path or is out of v1 scope).
Priority: **P0** core wiki feel · **P1** important · **P2** nice-to-have.

---

## 1. Reading — page anatomy

| Feature | Notes / mapping | Effort | Pri |
|---|---|---|---|
| Headings & sections with `#` anchors | markdown-it auto-slug headings; hover anchor links | ⚒ | P0 |
| Auto table of contents (sticky) | built from heading tree after render; sticky on desktop | ⚒ | P0 |
| Lead/summary section | first block before first heading (MoS lead convention) | ★ | P1 |
| Internal wikilinks `[[Page]]` + **red links** | rewrite `[[..]]`→link; style missing pages red (needs a page index, §5) | ⚒ | P0 |
| Footnotes / references `[^1]` + reference list | markdown-it footnote plugin | ⚒ | P1 |
| Infobox (fact panel, top-right) | from Markdown frontmatter; floats on desktop, stacks on mobile | ⚒ | P1 |
| Images / media | standard Markdown; lazy-load; served via jsDelivr | ★ | P1 |
| Categories / tags + category pages | frontmatter `tags`; a `/category/<x>` listing page | ⚒ | P1 |
| "Last edited by `<author>` on `<date>`" | from git history of the file (GitHub API) | ★ | P0 |
| Breadcrumbs for nested slugs (`a/b/c`) | derive from the slug path | ★ | P1 |
| Responsive / mobile layout | Tailwind; mobile infobox placement | ⚒ | P0 |
| Read/print mode, content width cap | Vector-2022-style limited width | ⚒ | P2 |

## 2. Page actions (the Wikipedia tab bar)

| Feature | Notes / mapping | Effort | Pri |
|---|---|---|---|
| Tabs: **Read · Edit · History · Talk** | top-of-page tab bar | ⚒ | P0 |
| Per-section `[edit]` links | split Markdown by heading; edit one section | ⚒ | P1 |
| Permalink to a revision | jsDelivr `@<sha>` URL | ★ | P1 |
| "What links here" (backlinks) | derive from the wikilink index (§5) | ⚒ | P2 |
| Page information / metadata | size, contributors, created/updated (git) | ★ | P2 |
| Watch / notifications | needs accounts | ⊘ | — |

## 3. History & revisions — git is our superpower

| Feature | Notes / mapping | Effort | Pri |
|---|---|---|---|
| Revision list (date · author · summary) | `git log` for the file via GitHub API | ★ | P0 |
| Diff between any two revisions | GitHub compare/commit API → rendered diff | ★ | P0 |
| Permalink to a past revision | jsDelivr `@<sha>` | ★ | P1 |
| Per-line attribution (blame) | GitHub GraphQL `blame` | ★ | P2 |
| Revert a revision | submit the prior content as a new anon edit (PR) | ⚒ | P1 |

## 4. Editing DX

| Feature | Notes / mapping | Effort | Pri |
|---|---|---|---|
| Live preview (rendered Markdown) | reuse the page renderer beside the textarea | ⚒ | P0 |
| Edit summary field | already a Worker param; surface in UI | ★ | P0 |
| Section editing | edit a single section, splice back | ⚒ | P1 |
| Markdown toolbar (bold/link/heading/list) | textarea helpers | ⚒ | P1 |
| Create-new-page flow | red link → editor with empty draft (Worker already supports new files) | ★ | P0 |
| Show diff before submitting | diff draft vs current | ⚒ | P1 |
| Edit-conflict handling | base-SHA check in the Worker; warn on stale base | ⚒ | P1 |
| Syntax help / cheatsheet | static help panel | ★ | P2 |

## 5. Navigation & discovery

| Feature | Notes / mapping | Effort | Pri |
|---|---|---|---|
| Page index / manifest | JSON list of pages (powers wikilinks, red links, search, backlinks) | ⚒ | P0 |
| Full-text search | over the manifest/content; client index for small wikis, or Worker-proxied GitHub code search at scale | ⚒ | P1 |
| Sidebar / global nav | configurable nav tree | ⚒ | P1 |
| Recent changes (site-wide) | repo commit feed (GitHub API) | ★ | P1 |
| Random page | from the manifest | ★ | P2 |
| Category browse | listing pages by tag | ⚒ | P2 |

## 6. Theming (parallel workstream)

| Feature | Notes | Pri |
|---|---|---|
| Tailwind integration | adopt Tailwind for all UI | P0 |
| Centralized theme tokens | colors, type, spacing, radii as CSS vars → Tailwind theme | P0 |
| Config-driven theming | non-devs edit one config (or frontmatter) to restyle | P1 |
| Swappable skins/templates | layout presets (e.g. "Vector-like", "minimal", "docs") | P1 |
| Dark mode | token-based | P1 |

---

## Suggested build order

1. **Foundation:** Tailwind + theme tokens (§6 P0), page **manifest** (§5 P0).
2. **Reading core:** headings/anchors, **TOC**, wikilinks + red links, "last edited"
   metadata, tab bar (§1–2 P0).
3. **History (cheap wins):** revision list + diff view + permalinks (§3 P0–P1).
4. **Editing DX:** live preview, edit summary, create-new-page, then section edit
   + pre-submit diff (§4).
5. **Discovery:** search, recent changes, sidebar (§5).
6. **Polish:** infobox, footnotes, categories, blame, skins, dark mode.
