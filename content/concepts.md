---
kicker: Plain-language guide
description: The words behind Wikigit — wiki, git, commit, repository, CDN, pull request, Worker — explained without jargon.
protection: maintainer
translationKey: concepts
tags:
  - Help
  - Reference
hatnote: Want the technical version instead? See How it works.
banner:
  kind: info
  text: This page assumes no technical background. If a term is unfamiliar, it is explained here.
infobox:
  Type: Glossary
  Audience: Everyone
  Jargon: explained, not assumed
---

# Concepts explained

Wikigit borrows a handful of tools that have technical names. You do **not** need
to know any of them to read or edit — but if you are curious what they mean, this
page explains each one in plain language, with no assumptions.

## What is a wiki?

A **wiki** is a website that its own readers can edit. Instead of one author
publishing finished articles, many people improve the same pages over time. The
most famous example is [[w:Wikipedia|Wikipedia]]. Wikigit is software for running
your own wiki.

## What is git?

**Git** is a tool that remembers every version of a set of files. Think of it as
an unlimited "undo" history shared by everyone: each time someone changes a file,
git records *who* changed it, *when*, and *exactly what* changed — without ever
throwing away the older versions.

Because git already does this so well, Wikigit uses it as the page history. The
list of past versions you see under **History** is simply git's record.

## What is a commit?

A **commit** is one saved change — a snapshot of the files at a moment in time,
with a short note describing it (the "edit summary"). Every time you publish an
edit in Wikigit, that becomes a commit.

Each commit has a unique fingerprint called a **SHA** (a long string like
`8c3f1a2…`). That fingerprint is how Wikigit can point to one exact version of a
page forever — for example in a permanent link to an old revision.

## What is a repository?

A **repository** (or "repo") is the folder of files that git is tracking, stored
online so everyone shares the same copy. Wikigit keeps its repository on
[[w:GitHub|GitHub]], a popular home for repositories. In Wikigit, the repository
*is* the database: every page is just a text file inside it.

## What is a CDN?

A **CDN** — content delivery network — is a worldwide network of servers that
keep copies of files close to readers, so pages load quickly no matter where you
are. Wikigit reads each page from a free CDN, which is why reading is fast and
why the site never has to be rebuilt when a page changes.

## What is a pull request?

A **pull request** (often "PR") is a proposed change waiting for someone to
approve it before it becomes part of the shared pages. It is how Wikigit reviews
edits from new or untrusted contributors: the edit is saved as a proposal, and a
maintainer can accept or decline it. Trusted edits skip this step and publish
straight away.

## What is the Worker?

A **Worker** is a tiny program that runs on Cloudflare's servers, on demand,
without a machine of its own to manage. Wikigit uses exactly one. Its only job is
to take the text you typed and save it as a commit on your behalf — because, for
security reasons, your browser cannot be trusted to do that directly. It is the
single piece of infrastructure Wikigit runs, and you never see it.

## Who are you when you edit?

You do not create an account, but each edit is still attributed to someone:

- **Anonymously (the default).** Wikigit turns your network address into a short
  nickname like `anon-3f9a2c` using a *one-way* scramble. "One-way" means the
  nickname can be created from the address but the address can never be worked
  back out from the nickname. Your real address is never stored.
- **As your GitHub self (optional).** If you sign in with GitHub, your edits are
  credited to your GitHub name instead — useful if you *want* the credit.

This keeps contributions accountable (the same person keeps the same nickname)
while storing no personal information. More detail lives in
[[governance|Governance & moderation]].

## Putting it together

When you edit a page in Wikigit:

1. You type **Markdown** (simple formatting — see [[help/formatting|the syntax guide]]).
2. The **Worker** saves it as a **commit** in the **repository** on **GitHub**.
3. The **CDN** serves the new version to the next reader — with no rebuild.

That is the whole machine. For the architecture view of the same story, see
[[how-it-works|How it works]].

## See also

- [[getting-started|Getting started]] — do your first edit.
- [[how-it-works|How it works]] — the same ideas, for a technical reader.
- [[help|Help]] — writing, formatting, and contributing.
