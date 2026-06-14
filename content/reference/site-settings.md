---
description: The settings that apply to a whole Wikigit — name, look, languages,
  home page, maintainers — edited from a form inside the site, with no rebuild.
kicker: Reference
protection: auto
hatnote: For options on a single page, see [[reference/page-settings|Page settings]].
infobox:
  Scope: The whole wiki
  Stored as: A small settings file
  Edited from: The in-site Settings screen
  Takes effect: Next page load, no rebuild
tags:
  - Reference
---

# Site settings

A wiki's own settings live in one small file, which you edit through a **Settings** screen inside the site. You change values in a form; there's no code, and no rebuild — a saved change reaches the next reader straight away.

## What you can set

- **Name** — the wiki's title, shown in the header and the browser tab.
- **Tagline** — a short line beneath the name.
- **Default look** — the starting [[help/customize|appearance]] for every visitor: style (Wikigit or Wiki), light/dark/auto, width, and text size. A reader can override it for themselves.
- **Home page** — which page is the front page (normally `index`).
- **Languages** — the [[multilingual|languages]] your wiki supports.
- **Maintainers** — the people with [[trust-and-moderation|maintainer]] standing, listed here so the role is declared in one obvious place.

## Connection settings

Two settings point your wiki at the services behind it: where your pages live, and where the [[how-it-works|Engine]] that saves edits runs. On a wiki hosted by wikigit.org these are filled in for you and you'll never touch them. They matter only if you [[help/create-your-wiki|run the Engine yourself]], in which case you set them to your own deployment.

## How edits are handled

A few wiki-wide choices control how open the wiki is. They ship with sensible defaults, so you only change them deliberately:

- **Default for new pages** — whether edits to an unprotected page publish at once or wait for review.
- **Earning trust** — how many accepted edits, over how long, before someone's edits stop needing review.
- **Bot check** — the [[anonymous-editing|proof-of-work check]] on anonymous edits (on by default; tunable).
- **Auto-moderator** — whether obvious vandalism is undone automatically (off by default).

These are explained in plain terms in [[trust-and-moderation|Trust and moderation]].

## See also

- [[reference/page-settings|Page settings]] — the options on a single page.
- [[help/customize|Customize]] — a friendlier walk through the same settings.
- [[trust-and-moderation|Trust and moderation]] — what the edit-handling choices do.

{{shared/concepts-navbox}}
