---
kicker: Guide
description: How to read, edit, and create pages in Wikigit — and how to deploy your own copy.
protection: auto
translationKey: getting-started
tags:
  - Guides
  - Getting started
hatnote: For the architecture behind these steps, see How it works.
infobox:
  Type: How-to guide
  Audience: New readers and editors
  Reading time: ~4 min
  Account needed: No
---

# Getting started

This page walks you through the three things you will do most in Wikigit: **read**
a page, **edit** one, and **create** a new one. None of it requires an account.

## Reading

Reading is just browsing. Every page is fetched from a [[concepts|CDN]]
and rendered in your browser, so pages load fast and are always the latest
version. As you read, notice:

- The **table of contents** on the side, built automatically from the headings.
- **Internal links** like [[concepts|Concepts explained]] that jump to other
  pages here. A link in **red** points to a page that does not exist yet.
- **Interwiki links** like [[w:Wikipedia|Wikipedia]] that lead out to Wikipedia
  for topics already covered well there.
- The **Talk** tab, where readers discuss the page.

## Editing

1. Click **Edit** at the top of any page (or the small **edit** link beside a
   section heading to jump straight to that section).
2. Type in [[w:Markdown|Markdown]]. A **live preview** updates beside the text as
   you type, so you always see the result.
3. Write a short **edit summary** describing your change.
4. Click **Publish**.

Your draft is saved on your device while you type, so a refresh will not lose
your work. What happens after you publish depends on the page and on the trust
your identity has earned — see [[governance|Governance & moderation]]. In short:
trusted edits to open pages go live immediately; everything else is queued for a
quick review.

> You are never sent to GitHub to edit, and you never paste a token. A small
> relay saves the change as a commit for you. The mechanics are in
> [[how-it-works|How it works]].

## Creating a new page

There are two easy ways:

- **Follow a red link.** Any link to a page that does not exist shows in red;
  click it and you will be invited to create that page.
- **Use the New page wizard.** It takes a title, previews the page's address,
  warns if the page already exists, and seeds a starting template (Article,
  Guide, or Blank).

When you save, the new page exists immediately — no rebuild.

## Who you are when you edit

You do not log in, but every edit is still **signed**:

- **Anonymously by default** — as a stable pseudonym such as `anon-3f9a2c`,
  derived from your network address with a one-way hash. The raw address is
  never stored, so the pseudonym cannot be traced back to you.
- **As yourself, optionally** — if you sign in with GitHub, edits are credited to
  your GitHub identity. This is only for people who *want* the credit.

The privacy model is explained in [[concepts|Concepts]]
and [[governance|Governance]].

## Deploy your own

Wikigit is open source. The reader is a static site you can host anywhere
(GitHub Pages, Netlify, Vercel, Cloudflare). To turn on in-site editing you add
one Cloudflare Worker and a few repository secrets — there is nothing to run on
your own machine and no database to manage. The repository's `README.md` has the
exact, click-to-deploy steps.

## Next steps

- [[concepts|Concepts explained]] — the vocabulary, in plain language.
- [[how-it-works|How it works]] — the architecture in one page.
- [[help/formatting|Formatting and syntax]] — everything you can type in a page.
