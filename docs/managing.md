---
title: Managing changes
description: Decide who can edit, review changes, undo mistakes, protect pages, and keep out trouble.
---

# Managing changes

A wiki invites everyone to help, which means you'll occasionally need to steer things — approve a change, undo a bad one, or stop a persistent troublemaker. Wikigit gives you light-touch tools for all of it, and sensible defaults so you rarely have to think about it.

## Who can edit

By default, edits from newcomers and anonymous visitors are **submitted for your review** rather than going live instantly, while people you trust can publish directly. You choose how open or cautious to be.

Trust builds up automatically: as someone makes more accepted edits over time, they earn more standing and their changes start going live without review. You can also hand someone **trusted-editor** status directly, which lets them publish and help you moderate. New accounts get no special treatment — trust is earned by contributing, not by signing up.

## Reviewing changes

Pending edits wait in a **review queue**. For each one you can see exactly what's changing and then approve it or set it aside. Wikigit also flags edits that look risky — large deletions, brand-new pages, rapid back-and-forth — so the ones worth a closer look rise to the top. Marking an edit as reviewed ("patrolled") clears it from the queue.

## Undoing mistakes

Because every version is kept, fixing a bad edit is easy:

- **Undo** a single change to put a page back the way it was.
- **Restore** any earlier version of a page.
- **Roll back** everything one person changed in a single sweep, if needed.

None of this loses history — the undo is itself just another saved version.

## Protecting pages

Lock down a page that shouldn't change freely — your home page, a policy page, a finished article. Set its **protection** so only trusted editors (or only maintainers) can edit it, while the rest of the wiki stays open. You can protect a single page or a whole section.

## Keeping out trouble

- **Block** a disruptive visitor — across the whole wiki, or just on certain pages.
- **Filters** let you set automatic rules: flag or refuse edits that, say, blank a page, add known spam links, or match a pattern you choose.
- An optional **auto-moderator** can quietly undo edits that look clearly like vandalism, within limits you set, so obvious junk never sticks. It's off until you turn it on.
- If something genuinely bad was posted, you can **hide** a name or a specific version from the public lists.

Every moderation action is recorded in an **activity log** so you and your fellow maintainers always have a clear account of what was done and by whom.

## You're not doing this alone

All of these tools live in one place — see **[The admin area](admin.md)** — and you can share the load by granting trusted-editor status to people who've earned it.
