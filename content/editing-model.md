---
description: How an edit travels from typed to published in Wikigit — anonymous
  by default, published immediately or held for review based on earned trust.
kicker: Concepts
protection: auto
hatnote: For the step-by-step of making an edit, see [[help/editing|Editing pages]].
infobox:
  Primary path: Edit without an account
  On save: Publish now, or hold for review
  Decided by: The editor's trust tier
  Review style: After the fact, not before
tags:
  - Concepts
  - Editing
---

# Editing model

The **editing model** is the set of rules that decide what happens between someone typing a change and that change appearing on the page. Wikigit's answer to that question is shaped by one goal: make contributing as easy as it is on [[w:Wikipedia|Wikipedia]], where a stranger can fix a typo without making an account, while still keeping the wiki defensible against the people who abuse that openness.

Two ideas do most of the work. Editing happens in the site itself, and most edits publish straight away and are checked afterward rather than before.

## Editing in the site

A Wikigit page is edited where you read it. You click *Edit*, a panel opens with the page's Markdown and a live preview beside it, you make your change, and you save. There is nothing to install, no separate admin site, and no trip to GitHub's editor. The point is that the repository is the storage, not the interface — a reader should never have to know it exists.

This is a deliberate line in the sand. A wiki that sends you elsewhere to edit, or asks you to paste in a token first, has already lost the casual contributor who would have fixed one sentence and moved on. Keeping the whole loop inside the page is what makes that contributor possible.

## Publish first, check later

On most wikis worth running openly, the realisation is the same: if every edit waited for a human to approve it, nothing would move. So Wikigit, like Wikipedia, leans on *post-hoc* moderation. An edit from a trusted contributor goes live immediately, and anything questionable is caught and undone afterward, helped by the fact that [[revisions|every version is kept]] and any change reverses in a click.

That default flips for people the wiki doesn't know yet, or for pages that are locked down. There, an edit is held as a pending change for a maintainer to look at before it shows. The decision between "publish now" and "hold for review" comes down to one thing: how much the wiki trusts the person making the edit.

## Trust is earned, not granted

Everyone starts as a newcomer, whether they signed in or not. Signing up buys no special standing. What raises a contributor's standing is a track record — as their accepted edits add up over time, they cross into a tier whose edits publish without waiting. A maintainer can also hand someone that standing directly.

These tiers, and the protection levels that pages can be set to, are the dial that turns the whole model from wide open to tightly held. They have a page of their own: [[trust-and-moderation|Trust and moderation]].

## Who gets credited

Every edit carries an author, and the author depends on how the person showed up. Signed-in editors get their name and picture. An [[anonymous-editing|anonymous editor]] is credited to a short, stable nickname instead. Either way the edit is attributed and lands in the page's history, so the record stays complete no matter how someone chose to contribute.

## See also

- [[anonymous-editing|Anonymous editing]] — the no-account path in detail.
- [[trust-and-moderation|Trust and moderation]] — tiers, protection, and undoing bad edits.
- [[help/editing|Editing pages]] — how to actually make a change.

{{shared/concepts-navbox}}
