---
description: About the Wikigit project — what it sets out to do, the principles
  behind it, and where it stands.
kicker: Concepts
protection: auto
infobox:
  Project: Wikigit
  Type: Wiki engine
  License:
    v: MIT
    mono: true
  Status: In active development
tags:
  - Concepts
---

# About Wikigit

This page is about the *project* rather than the software — what it's trying to do, and the handful of principles it won't bend on. For what Wikigit is and how to use it, start at [[index|the overview]].

## The idea

Wikigit started from one question: how much of a wiki do you actually have to build? The usual answer is "all of it" — storage, versioning, accounts, a discussion system, hosting, moderation. Wikigit's answer is "almost none of it," because most of those already exist as free, dependable services. [[w:Git|Git]] is a better version history than anything a wiki would write for itself. A [[how-it-works|CDN]] serves reading better than a wiki's own server. [[w:GitHub|GitHub]] already holds the files and the accounts. What's left over — a safe way to let anyone edit without an account — is small enough to be the only thing the project really builds.

## Principles

A few commitments shape every decision, and they're worth stating plainly because they're the reason some obvious shortcuts are off the table.

- **Editing stays in the site.** No sending a contributor to an external editor, no asking them to paste a token. The reader should never have to know there's a repository underneath. See [[editing-model|Editing model]].
- **Anonymous editing comes first.** The [[anonymous-editing|no-account path]] is the one the design is built around, with sign-in offered on top of it — not the other way round.
- **No private data in the public record.** The repository holds a [[anonymous-editing|derived nickname]] and never a raw address or email. Anonymity is a property of the data, not a promise of good behaviour.
- **The content is yours.** Plain Markdown files in your own account, exportable and movable at any time. Nothing about the project is designed to keep you in it.

## Where it stands

Wikigit is in active development and pre-release. The core works end to end — reading from a CDN, [[editing-model|in-site editing]] with anonymous and signed-in contributors, [[trust-and-moderation|moderation]], [[talk-pages|talk pages]], [[multilingual|multiple languages]], and a hosted option on wikigit.org. Some pieces, like plugging in an organisation's own [[identity|login system]], are still ahead. Because this very site runs on Wikigit, the surest way to see the current state is to use it.

## See also

- [[index|Wikigit]] — the overview.
- [[how-it-works|Architecture]] — the technical design these principles produce.
- [[reference/glossary|Glossary]] — the vocabulary used across this wiki.

{{shared/concepts-navbox}}
