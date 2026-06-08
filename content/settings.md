---
kicker: Reference
description: The options on a single page, and the settings for your whole wiki.
protection: auto
tags:
  - Documentation
  - Reference
---

# Settings

There are two kinds of settings: ones that apply to **a single page**, and ones that apply to your **whole wiki**.

## Page settings

When you edit a page, a **Properties** panel holds that page's options. You fill in a form — there's nothing to hand-write. The available options:

| Setting | What it does |
|---|---|
| **Summary** | A one-line description, shown in search results and hover previews. |
| **Top note** | A short italic note at the very top — usually a pointer to a related page. |
| **Notice** | A colored banner (info or warning) across the top — for drafts, cautions, and the like. |
| **Label** | A small word above the title, such as "Article" or "Guide". |
| **Header image** | A picture shown with the page and used when the page is shared. |
| **Quick facts** | The boxed table of facts beside the opening — dates, values, links. |
| **Categories** | The topics this page belongs to (see [[organizing|Organizing your wiki]]). |
| **Who can edit** | The page's protection level — leave it open, or limit edits to trusted editors or maintainers. |
| **Page look** | Override the default style, light/dark, width, or text size for just this page. |
| **Redirect to** | Send anyone who opens this page straight to another one. |
| **Translation group** | Links this page to its versions in other languages. |

You won't use all of these on most pages — a summary and maybe a category is plenty.

## Whole-wiki settings

These live in a short **settings file** in your GitHub copy. You change values in a form-like file; there's no code to write.

- **Name and logo** — what appears in the header.
- **Default look** — the style, light/dark, width, and text size visitors start with.
- **Home page** — which page is your front page (normally `index`).
- **Languages** — the languages your wiki supports.
- **Where your pages live** and **where the editor service lives** — the two connection settings, filled in for you during [[create-your-wiki|setup]].

## How edits are handled (maintainer settings)

A few wiki-wide choices control how open your wiki is. They come with sensible defaults, so you only touch them if you want to:

- **Default for new pages** — whether edits to an unprotected page go live immediately or wait for review.
- **Earning trust** — how many accepted edits, over how long, before someone's edits stop needing review.
- **Bot check** — an optional, invisible check that stops automated spam on anonymous edits.
- **Auto-moderator** — whether obvious vandalism is undone automatically (off by default).

These are explained in plain terms in [[managing|Managing changes]].
