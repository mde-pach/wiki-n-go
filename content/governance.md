---
kicker: Reference
description: How Wikigit keeps open editing safe — trust tiers, page protection, anti-vandalism, patrol, blocks, and the admin console.
protection: maintainer
translationKey: governance
tags:
  - Reference
  - Moderation
hatnote: For how editing works mechanically, see How it works.
infobox:
  Type: Policy & moderation
  Default: trusted edits publish, others reviewed
  Trust: earned from history
  Console: the /admin dashboard
  Identity: anonymous hash, no raw IP stored
---

# Governance and moderation

Letting anyone edit without an account creates the largest possible abuse
surface, so moderation is essential, not optional. Wikigit handles it mostly
through **policy and git**, not extra infrastructure — closely mirroring the way
[[w:Wikipedia|Wikipedia]] balances openness with control.

## The editing model

Wikigit supports both of the models a wiki can use, and chooses between them
**per page**:

- **Immediate publish** — the edit goes live at once, and problems are fixed
  afterward. This is the norm for trusted editors on open pages.
- **Review before publish** — the edit becomes a pull request a maintainer
  approves first. This is the default for new contributors and protected pages.

Which one applies depends on the page's protection and the editor's earned trust.

## Trust tiers

Trust is **earned from history**, not granted on request. Wikigit looks at the
commits a pseudonym has authored — counting both direct edits and merged pull
requests — and places it on a tier:

| Tier | Roughly | Effect |
|---|---|---|
| **open** | brand new | edits to open pages reviewed; nothing assumed |
| **auto** | a handful of clean edits over a few days | edits to open pages publish immediately |
| **extended** | many edits over a longer period | unlocks more sensitive pages |
| **maintainer** | granted by the owner | full moderation powers |

Because the lower tiers can be gamed by switching networks, real power is
reserved for the human-granted **maintainer** tier. There is nothing to apply
for at the automatic tiers — keep making good edits and trust accrues.

## Page protection

Any page can declare a minimum tier required to edit it, using a `protection:`
field in its front-matter (`open`, `auto`, `extended`, or `maintainer`). Raising
or lowering a page's protection is itself a privileged action, so a low-trust
editor cannot simply unprotect a page to edit it. Maintainers can also set
protection from the admin console.

## Anti-vandalism

Before an immediate-publish edit lands, it passes a **rule check** — built-in
checks (mass blanking, large additions, link floods, blocked domains) plus any
custom rules maintainers add. A rule can **block** an edit outright or **tag** it
for attention. Trusted tiers are exempt. A separate **revert-risk score** and an
**edit-war** flag (for rapid back-and-forth edits) help reviewers triage what to
look at first.

## Patrol and search visibility

New, unreviewed changes enter a **patrol queue** for maintainers. Until a page's
latest change is patrolled, the page asks search engines not to index it — so
unreviewed content does not surface in search. Edits by sufficiently trusted
editors are **auto-patrolled** and skip the queue. The check fails open: if the
moderation service has a hiccup, pages stay indexable rather than disappearing.

## Cleaning up

When something bad does land, maintainers have fast, reversible tools:

- **Rollback** — undo every page a bad commit touched, back to its prior state.
- **Restore** — set a single page back to any earlier revision.
- **Delete / undelete** — remove a page; because git keeps the history, undeleting
  is just restoring a pre-deletion revision.

Every one of these is a new commit, so it can itself be undone — nothing is ever
truly destroyed.

## Blocks and the audit trail

Abusive contributors can be **blocked** — site-wide, or scoped to certain page
areas. Blocks are recorded in a file in the repository, so the record is part of
git history. Moderation actions (rollbacks, blocks, unblocks) are also written to
an append-only **audit log**.

## The admin console

All of the above lives in one maintainer-only **admin dashboard** (`/admin`): a
single place for recent changes, the review and patrol queues, new pages,
rollback and restore, blocks, protection, contributor rights, suppression, and
the audit log. It is the control room for running the wiki.

## Identity and privacy

Wikigit's privacy stance is deliberately stronger than most wikis':

- Only a **one-way hash** of your network address is ever stored — never a raw IP
  or email. There is therefore **no capability to reveal an editor's IP**,
  because it was never kept.
- The same property means network-range blocking is impossible by design; Wikigit
  relies on review, rate limits, and anti-bot checks instead. This is an accepted
  trade for the privacy guarantee.
- **Suppression** can hide an author or revision label from the public history
  surfaces. A complete erasure from git history remains a manual owner operation.

The mechanics of how identity is derived are in
[[how-it-works|How it works]] and, in plain language,
in [[concepts|Concepts explained]].

## See also

- [[features|Features]] — the full capability tour.
- [[how-it-works|How it works]] — the architecture these policies run on.
- [[help/editing|Editing and contributing]] — what this means for you as an
  editor.
