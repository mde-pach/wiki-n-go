---
description: How Wikigit balances open editing with control — trust tiers, page
  protection, review, reverting, blocks, filters, and a logged audit trail.
kicker: Concepts
protection: auto
hatnote: The day-to-day tools described here live in [[help/administration|the admin area]].
infobox:
  Trust tiers: Newcomer, trusted, extended, maintainer
  Protection levels: Open, auto, extended, maintainer
  Reverting: Undo, restore, roll back
  Auto-moderator: Off until you turn it on
  Every action: Written to an audit log
tags:
  - Concepts
  - Moderation
---

# Trust and moderation

Open editing only works if there is a way to deal with the small share of edits that aren't made in good faith. Wikigit's approach is to keep the front door open and put the controls behind it: edits flow freely by default, and a layer of tools lets maintainers slow things down exactly where they need to. The aim is a wiki that takes very little tending on a quiet day and gives you real leverage on a bad one.

## Trust tiers

Every contributor sits in a tier, and the tier decides whether their edits publish on their own or wait for a look. Newcomers and anonymous editors are at the bottom; their edits can be held for review. As someone's accepted edits accumulate, they rise into a trusted tier and their changes start going live without waiting. Above that, an *extended* tier and a *maintainer* tier carry more standing and more responsibility.

The key property is that standing is earned by contributing, not bought by registering. A fresh account starts with no more privilege than an anonymous visitor. A maintainer can also promote someone directly when they've clearly earned it.

## Page protection

Trust describes people; **protection** describes pages. Any page can be set to one of four levels, matching the tiers:

| Level | Who can edit it |
|---|---|
| Open | Anyone the wiki allows |
| Auto | Held for review from newcomers; trusted editors publish directly |
| Extended | Only longer-standing editors |
| Maintainer | Only maintainers |

Most pages stay open or auto. You reach for the stricter levels on the pages where a bad edit costs the most — the home page, a policy page, a finished article that shouldn't drift. The rest of the wiki stays as open as ever.

## Reviewing and reverting

Edits that are held land in a **review queue**, where each one shows exactly what it changes so a maintainer can accept it or set it aside. Wikigit raises the riskier-looking ones to the top — large deletions, brand-new pages, the same page being changed back and forth — so attention goes where it's needed.

When something does slip through, [[revisions|the full history]] makes fixing it cheap:

- **Undo** reverses a single edit.
- **Restore** rolls a page back to any earlier version.
- **Roll back** reverses everything one person changed, in one sweep.

None of this erases anything. An undo is itself just another saved version, so the record of what happened, including the mistake, stays intact.

## Holding back trouble

For the people who keep coming back to cause problems, there are firmer measures.

- **Blocks** stop a disruptive contributor, across the whole wiki or on particular pages.
- **Filters** are rules you set in advance: flag or refuse an edit that blanks a page, adds a known spam link, or matches a pattern you choose.
- An optional **auto-moderator** quietly undoes edits that look like plain vandalism, within limits you set. It stays off until you switch it on.
- If something genuinely harmful was posted, you can **hide** a name or a specific version from the public lists, without rewriting history.

## A logged trail

Every moderation action — each block, each protection change, each thing hidden — is written to an **audit log** that records what was done and by whom. On a wiki with more than one maintainer that matters: it keeps the people with power accountable to each other, and gives you an honest account of how the wiki has been run.

## See also

- [[editing-model|Editing model]] — why most edits publish before they're checked.
- [[help/administration|Administration]] — where these controls live and how to use them.
- [[special-pages|Special pages]] — the reports that surface what needs attention.

{{shared/concepts-navbox}}
