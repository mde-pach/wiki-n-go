---
kicker: Help
protection: maintainer
description: How to make an edit, what happens after you save, and how editing trust is earned.
tags:
  - Help
infobox:
  Type: Help page
  Audience: Editors
  Reading time: ~3 min
hatnote: For the syntax you'll type, see Formatting and syntax.
---

# Editing and contributing

Anyone can edit any unprotected page — no account, no token. This page covers
the whole loop: making a change, signing it, and what happens after you save.

## Make an edit

1. Open a page and click **Edit** (or the **edit** link beside any section
   heading to jump straight to that part).
2. Type Markdown in the editor. A **live preview** renders beside it as you
   type, so you can see the result before saving.
3. Write a short **edit summary** describing what you changed.
4. Click **Publish**.

Your draft is kept on your device as you type, so a refresh or an accidental
close won't lose your work. It is cleared once the edit is saved.

## Creating a new page

Open a link to a page that doesn't exist yet — it shows as a **red link** — and
you'll be invited to create it. You can also use the **New page** wizard, which
takes a title, previews the slug, and seeds a starting template.

## How your edit is signed

You're attributed automatically; you never sign manually.

- **Anonymous (default).** Your edit is attributed to a stable pseudonym such as
  `anon-3f9a2c`, derived from your network address with a one-way hash. The raw
  address is never stored — there is no way to reverse it back to you.
- **Signed in (optional).** If you sign in with GitHub, your edits are credited
  to your GitHub identity instead. This is only for contributors who *want*
  credit; it's never required.

## What happens after you save

Whether your edit publishes immediately or waits for review depends on the page
and on the trust your pseudonym has earned:

| Situation | Result |
|---|---|
| Trusted editor, ordinary page | Publishes **immediately**, live on the CDN |
| New or untrusted editor | Submitted as a **pull request** for a maintainer to review |
| Protected page | Reviewed regardless of who you are |

Trust is **earned from history**: as the same pseudonym makes clean edits over
time, it moves from `open` to `auto` to `extended`, unlocking immediate
publishing. There's nothing to apply for — keep making good edits.

## Discussion

Every page has a **Talk** tab for proposing changes, asking questions, and
reaching consensus before editing. Comments are signed the same way edits are.

## Be a good neighbour

- Make one focused change per edit, with a clear summary.
- Stay civil and on topic on Talk pages.
- Cite sources where it matters — the [[help/formatting|formatting guide]] shows
  how to add footnotes, and the **Cite** tool can build a reference from a URL,
  DOI, or ISBN for you.
