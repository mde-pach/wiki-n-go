---
description: Wikigit is a wiki engine that stores every page as a Markdown file
  in a Git repository and renders it live, with no rebuild and almost no server.
translationKey: index
kicker: Concepts
protection: auto
infobox:
  Type: Wiki engine
  Pages stored as: Markdown in Git
  Backend: The Engine (a Bun server)
  Reading: Served from a CDN
  Editing: In the browser
  Identity: Anonymous or sign-in
  Hosting:
    v: Free tier
  License:
    v: MIT
    mono: true
tags:
  - Concepts
  - Getting started
banner:
  kind: info
  text: This site is a Wikigit, running on Wikigit. Every page you read here is
    an ordinary file you can open and edit.
---

# Wikigit

**Wikigit** is a wiki engine — software for running a website that a group of people write together, one page at a time. It works the way [[w:Wikipedia|Wikipedia]] taught everyone to expect: open a page, click *Edit*, change it, save. What makes it unusual is underneath. Every page is a plain [[w:Markdown|Markdown]] file kept in a [[w:Git|Git]] repository, not a row in a database.

::image[Wikigit inherits Wikipedia's "anyone can edit" idea, but keeps the pages as files in Git.]{src=https://commons.wikimedia.org/wiki/Special:FilePath/Wikipedia-logo-v2.svg align=right width=150 upright}

That one decision settles most of the others. The page history is the repository's history, so nothing is ever really lost. The content is yours, because it lives in your own [[w:GitHub|GitHub]] account as files you can copy or move whenever you like. And there is barely anything to run: readers load pages straight from a [[w:Content delivery network|content delivery network]], and the only custom piece is one small program that saves people's edits.[^stack]

## What it is for

A wiki fits whenever a group needs to keep shared knowledge in one place and let many hands maintain it. A community or fan wiki, a game guide, a project's documentation, a team handbook, a personal notebook you want to publish — all of these are collections of linked pages that change over time, which is what a wiki is.

You don't have to be a programmer to run one. If you can copy a project on GitHub and click through a short setup, you can have a working Wikigit in a few minutes. Writing pages is closer to writing an email than to writing code.

## How it works, briefly

The system splits in two, and the split is the whole trick.

Reading costs nothing to run. Each page is fetched from a CDN at the exact version it was last saved, so a change shows up the moment the next person opens the page. There is no build step and no waiting. Editing is the only part that needs a server, and it is a deliberately small one: a single program called the **Engine** that takes an edit, checks it, and writes it back to the repository as a commit.

The longer version, with both paths drawn out, is in [[how-it-works|Architecture]].

## Editing and who can do it

Anyone you allow can edit, and there are three ways a person can show up. They can stay anonymous, the way a passer-by fixes a typo on Wikipedia, in which case the edit is credited to a short nickname. They can sign in with GitHub. Or they can sign in with a Wikigit account, which needs only an email address and a one-time code. None of this is required to read, and you choose which of them may write. See [[identity|Identity and accounts]].

A newcomer's edit either goes live at once or waits for a quick review, and people earn the right to publish directly as their accepted edits add up. That balance — open enough to invite help, careful enough to stay clean — is the [[editing-model|editing model]]. The tools for steering it are in [[trust-and-moderation|Trust and moderation]].

## What it costs

For an ordinary wiki, nothing. Reading runs on a free CDN. Editing goes through the Engine, which wikigit.org will host for you at no cost, or which you can run yourself on a small server. Either way a normal wiki fits comfortably within free tiers. And because the content is just files in your own account, you are never locked in, and never paying to get your own pages back.

## Background

The design starts from a question: how much of a wiki do you actually have to build? Wikigit's answer is "almost none of it." History, hosting, the discussion layer, even sign-in already exist as free, dependable services. Git keeps the history. A CDN serves the reading. [[w:GitHub|GitHub]] holds the storage and the accounts. What none of them provides is a safe way to let an anonymous visitor write to a repository without handing them the keys. That missing piece is the Engine, and the rest is glue.

## Explore this wiki

This site documents Wikigit by being one. The pages below are the reference.

**Concepts** — [[how-it-works|Architecture]] · [[editing-model|Editing model]] · [[anonymous-editing|Anonymous editing]] · [[identity|Identity and accounts]] · [[trust-and-moderation|Trust and moderation]] · [[talk-pages|Talk pages]] · [[categories|Categories]] · [[links-and-references|Links and references]] · [[media|Images and media]] · [[anatomy-of-a-page|Anatomy of a page]] · [[revisions|Revision history]] · [[multilingual|Multilingual wikis]] · [[special-pages|Special pages]]

**Guides** — [[help/create-your-wiki|Create your wiki]] · [[help/editing|Editing pages]] · [[help/formatting|Formatting]] · [[help/customize|Customize]] · [[help/organizing|Organizing]] · [[help/administration|Administration]] · [[help/signing-in|Signing in]]

**Reference** — [[reference/page-settings|Page settings]] · [[reference/site-settings|Site settings]] · [[reference/glossary|Glossary]] · [[reference/faq|FAQ]]

## See also

- [[help/create-your-wiki|Create your wiki]] — set up your own, step by step.
- [[editing-model|Editing model]] — how a change goes from typed to published.
- [[anonymous-editing|Anonymous editing]] — editing without an account, and why it stays safe.

## References

[^stack]: Reading is served by the [jsDelivr](https://www.jsdelivr.com/) CDN. Editing goes through the Engine — a small [Bun](https://bun.sh/) server that wikigit.org can host for you, or that you can run yourself behind a reverse proxy.

{{shared/concepts-navbox}}
