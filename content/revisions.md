---
description: Wikigit's revision history is the Git history of the page files —
  every version kept, comparable, and reversible in a click.
kicker: Concepts
protection: auto
infobox:
  Backed by: Git commit history
  Versions kept: All of them
  Compare: Any two versions
  Reverse a change: Undo, restore, roll back
tags:
  - Concepts
  - Editing
---

# Revision history

Every Wikigit page remembers every version of itself, and that memory isn't a feature bolted on — it *is* the [[w:Git|Git]] history of the file. Each saved edit is a commit. So the page's history is simply the list of commits that touched it, with the author and the time already attached, for free, by the same machinery that stores the content.

This is the quiet payoff of [[how-it-works|keeping pages in Git]]: a wiki normally has to build versioning, and Wikigit just inherits a mature one.

## What you can do with it

- **History** lists every past version of a page — who made it, when, and the short summary they left. Each version has a permanent address, so an old revision can be linked to and read exactly as it was.
- **Compare** puts any two versions side by side and highlights what changed between them, down to the line.
- **Undo** reverses a single edit.
- **Restore** brings back any earlier version wholesale.
- **Roll back** reverses a run of edits — useful for cleaning up after one bad actor in a sweep.

## Nothing is destructive

The thing to internalise is that going backward never loses anything. Undoing an edit doesn't delete it; it adds a new version that happens to match an old one. The bad edit, and the fix, both stay in the record. That's what makes [[editing-model|publishing first and checking later]] safe to do: there is no change so bad that it can't be reversed, and no reversal that costs you the history of what happened.

It's also why your content is never at risk from the wiki itself. The full history lives in your [[w:GitHub|GitHub]] repository as ordinary commits, yours to clone or keep a copy of at any time.

## See also

- [[how-it-works|Architecture]] — why each version has a permanent address.
- [[trust-and-moderation|Trust and moderation]] — undo and roll back as moderation tools.
- [[editing-model|Editing model]] — the publish-first model that history makes safe.

{{shared/concepts-navbox}}
