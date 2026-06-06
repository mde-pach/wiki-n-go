---
kicker: Reference
description: A tour of what Wikigit can do — reading, editing, history, multilingual articles, special pages, citations, and moderation.
protection: maintainer
translationKey: features
tags:
  - Reference
  - Features
hatnote: For how these are built, see How it works; for moderation, see Governance.
infobox:
  Type: Feature overview
  Editing model: anonymous-first, in-site
  Languages: multilingual articles
  History: full git history + diffs
---

# Features

Wikigit aims to give a small wiki most of what a large one has — without the
operations burden. This page tours the main capabilities. Each maps to a real
part of the system; the deeper "why" lives in [[how-it-works|How it works]] and
[[governance|Governance & moderation]].

## Reading

- **No-rebuild reading.** Pages render from the latest commit via a CDN, so a
  change is live without any build step.
- **Automatic table of contents** built from the headings, with active-section
  highlighting and a mobile drawer.
- **Wikilinks** `[[Page]]` between pages, with **red links** marking pages that
  do not exist yet and **hover previews** of the target page.
- **Interwiki links** `[[w:Title]]` that lead out to Wikipedia for topics already
  covered well there, visibly marked as leaving the wiki.
- **Infoboxes, hatnotes, and maintenance banners** declared in a page's
  front-matter — the panels and notices you see on this page and others.
- **Footnotes and citations** with hover tooltips and back-links, and
  **captioned figures** for images.
- **Collapsible sections**, **lead-term emphasis**, and **full-text search**
  across all pages.
- **Diagrams** via [[w:Mermaid (software)|Mermaid]] code blocks, rendered in the
  browser.

## Editing

- **In-site Markdown editor** with a **live preview** beside the text.
- **Per-section editing** — jump straight to one section from its heading.
- **Edit summaries**, **draft persistence** across reloads, and a confirmation
  step that shows the size of your change.
- **Create-new-page wizard** (`/new`) with a live address preview and starting
  templates.
- **No account and no token** to edit; an optional **GitHub sign-in** attaches
  your real identity if you want credit.

## History and revisions

- **Full revision history** per page, straight from `git log`, with author, date,
  summary, and byte change.
- **Diffs** between any two revisions (added/removed coloured), plus quick
  "current vs previous" links.
- **Permanent links to any past revision** (`?rev=<sha>`), with an "old revision"
  banner.
- **Move / rename** a page (leaving a redirect behind) and **restore** a page to
  an earlier version — both as ordinary, reversible commits.

## Multilingual articles

The same article can exist in several languages, each a fully independent page
with its own address, content, and history. Languages are tied together by a
small front-matter key, and a **language switcher** appears on pages that have
translations. This page's siblings — for example
[[fr/index|the French home]] — are linked this way. The default language keeps
clean, unprefixed addresses; other languages live under a prefix such as `/fr/`.

## Discussion (Talk)

- Every page has a **Talk** tab backed by GitHub Discussions.
- **Anonymous, threaded comments** with arbitrary-depth replies, per-comment
  permalinks, and reply counts — no GitHub login required to post.
- Comments are signed the same way edits are.

## Special pages and tools

Wikigit computes a set of **special pages** from the link graph and git history,
reachable from the **Special pages** menu, including:

- **What links here**, **Orphaned**, **Wanted** (red links), and **Dead-end**
  pages.
- **Most linked**, **All pages**, **Statistics**, and **Random**.
- **Redirects** with broken/double-redirect detection.
- **Page info** for any page.

There is also a **Cite** tool that turns a URL, DOI, or ISBN into a ready-to-paste
footnote, and **short descriptions** that feed search snippets and link previews.

## Moderation and governance

Open editing only works with good moderation. Wikigit provides **trust tiers**
earned from history, **per-page protection**, an **anti-vandalism rule pass**, a
**patrol queue**, **rollback/restore**, **blocks**, and an **admin console** —
all covered in [[governance|Governance & moderation]].

## Appearance

- **Light and dark** themes, plus a width and text-size control.
- **Swappable skins**: Wikigit's own look, or a near-replica of Wikipedia's.

## See also

- [[how-it-works|How it works]] — the architecture behind these features.
- [[governance|Governance & moderation]] — keeping open editing safe.
- [[help|Help]] — how to use the editing and formatting features.
