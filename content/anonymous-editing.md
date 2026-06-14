---
description: Editing a Wikigit page without an account, the way Wikipedia allows,
  with a derived nickname instead of a name and no personal data kept.
kicker: Concepts
protection: auto
infobox:
  Account needed: None
  Credited as: A short nickname
  Identity from: A one-way hash
  Personal data kept: None
  Bot check: A small puzzle, no third party
tags:
  - Concepts
  - Identity
  - Editing
---

# Anonymous editing

**Anonymous editing** lets someone change a page without signing in — the behaviour [[w:Wikipedia|Wikipedia]] is known for, where a passer-by can fix a mistake and never give a name. It is the primary path Wikigit is built around. Signing in is offered on top of it, not required underneath it.

When the wiki allows it, an anonymous edit works exactly like any other: open the page, edit, save. The only difference is in how the contribution is signed.

## A nickname instead of a name

An anonymous editor is credited to a short, stable nickname like `@anon-7f3a`. The same person editing again gets the same nickname, so their contributions hang together (you can follow what one anonymous editor has done across the wiki) without anyone learning who they are.

That nickname is derived from a one-way [[w:Hash function|hash]]. The Engine takes what it briefly sees about a request, mixes in a secret, and keeps only the resulting fingerprint. The original is never written down. There is no table mapping nicknames back to people, because the information needed to build one was thrown away.

## What is, and isn't, kept

This is the part worth being precise about, because privacy claims are easy to make and easy to get wrong.

Wikigit's repository never holds a raw address or an email. The public record — the commits, the history, the contributor lists — contains only the derived nickname. A real-world identity cannot be read back out of it, by you, by a reader, or by anyone who later clones the repository.[^anon] Anonymity here is a property of the design, not a promise to behave; the data simply isn't there to leak.

## Keeping it from being abused

Open editing invites the obvious problem: bots and floods. Wikigit handles this without calling out to a third-party service.

Anonymous saves are rate-limited, so one source can only edit so fast. They also have to clear a small [[w:Proof of work|proof-of-work]] check — the browser solves a quick computational puzzle before the edit is accepted, which is unnoticeable to a person and expensive to a script running at scale. And a contributor who keeps causing trouble can be blocked outright. None of this asks the editor to prove who they are; it just raises the cost of misbehaving.

## When to allow it

Anonymous editing is a setting, not a mandate. Leaving it on suits a wiki that wants the widest possible front door and the occasional drive-by fix. Turning it off, and requiring everyone to sign in, suits a wiki that would rather every edit have a face attached. Many wikis sit in between: anonymous edits allowed, but always [[editing-model|held for review]] until a human waves them through.

## See also

- [[identity|Identity and accounts]] — the three ways a contributor can show up.
- [[editing-model|Editing model]] — how anonymous edits are published or reviewed.
- [[trust-and-moderation|Trust and moderation]] — blocks, filters, and undoing bad edits.

## References

[^anon]: Storing only a derived hash, never a raw address or email, is a fixed rule of the project: the anonymous identity is the hash and nothing else.

{{shared/concepts-navbox}}
