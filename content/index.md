---
description: Wikigit is a collaborative wiki that renders without rebuilds and
  is edited in-site — no account, no token.
translationKey: index
infobox:
  Type: Wiki software
  Reading: from a CDN, no rebuild
  Editing: in-site, no account
  Backend: one Cloudflare Worker
  Storage: a GitHub repository
  Talk: GitHub Discussions
  License:
    v: MIT (software)
    mono: true
kicker: Project home
hatnote: This is the Wikigit project home. New here? Start with Getting started.
protection: auto
tags:
  - Reference
  - Wiki software
banner:
  kind: info
  text: This is a living demo — every page here is Markdown in a GitHub
    repository, and anyone can edit it.
---

# Welcome to Wikigit

**Wikigit** is a collaborative [[w:Wiki|wiki]] built on a simple idea: let
[[w:Git|git]] and [[w:GitHub|GitHub]] be the database, and let this site be the
only interface. Pages read instantly without ever rebuilding the site, and
anyone can edit a page **in the site itself** — no account and no token, the way
[[w:Wikipedia|Wikipedia]] works.[^friction]

Everything you are reading is a Markdown file in a public GitHub repository.
When that file changes, this page changes — there is no publish step and no
build to wait for.

## The big idea

A traditional wiki runs a server, a database, and an editor of its own. Wikigit
runs almost none of that. Instead it **composes systems that already exist**:

- **git** keeps every version of every page (the revision history).
- **GitHub** stores the files and hosts the discussions.
- **A free [[concepts|CDN]]** delivers pages to readers worldwide.
- **One small [[concepts|Worker]]** turns "someone typed an
  edit" into a saved change.

The result is a full wiki — reading, editing, history, talk pages, moderation —
with [[how-it-works|almost no infrastructure to run]].

## Start here

| If you want to… | Go to |
|---|---|
| Read and edit your first page | [[getting-started|Getting started]] |
| Understand the moving parts | [[how-it-works|How it works]] |
| Learn the words (wiki, git, CDN…) in plain language | [[concepts|Concepts explained]] |
| See everything Wikigit can do | [[features|Features]] |
| Learn how edits are reviewed and trusted | [[governance|Governance & moderation]] |
| Get help writing and formatting pages | [[help|Help]] |

## Try it right now

Click **Edit** at the top of this page. You will see the Markdown that produced
it, with a live preview beside the text. Change a word, write a short summary,
and publish — your change becomes a commit in the repository, and the page
updates with **no rebuild**.[^norebuild]

Prefer to start a fresh page? Open a link to something that does not exist yet,
like [[A page that does not exist]], and you will get a **red link** inviting you
to create it yourself.

## Why it is built this way

Running a wiki usually means running infrastructure. Wikigit's bet is that the
hardest parts — versioning, storage, identity, discussion, global delivery — are
already solved by tools you can use for free. The only piece that genuinely must
exist is a tiny relay that can write a commit on your behalf; everything else is
borrowed. The reasoning is laid out in [[how-it-works|How it works]].

## See also

- [[features|Features]] — the full tour, mapped to what is built.
- [[governance|Governance & moderation]] — trust tiers, protection, and the
  admin console.
- [[w:Wikipedia|Wikipedia]] and [[w:Wiki software|wiki software]] on Wikipedia.

## References

[^friction]: "Wikipedia-level friction" means you can edit and save without
    creating an account or pasting a token — the lowest barrier a public wiki
    can offer while still attributing each change.
[^norebuild]: Because pages are fetched at runtime from the CDN, a commit is
    live as soon as the cache refreshes. No site build runs when content
    changes — see [[how-it-works|the read path]].
