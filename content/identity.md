---
description: The three ways a contributor can show up on a Wikigit — anonymous,
  signed in with GitHub, or signed in with an email-based Wikigit account.
kicker: Concepts
protection: auto
infobox:
  Ways to contribute: Anonymous, GitHub, Wikigit account
  Wikigit account: Email and a one-time code
  Passwords: None
  Reputation: Grows with accepted edits
tags:
  - Concepts
  - Identity
---

# Identity and accounts

A wiki has to answer a small question on every edit: who made this? Wikigit gives three answers, and lets each wiki decide which it will accept. A contributor can stay [[anonymous-editing|anonymous]], sign in with [[w:GitHub|GitHub]], or sign in with a Wikigit account. None of the three is needed to read a page.

The three sit on a spectrum, from "no idea who you are, and that's fine" to "a name and a face on every edit." A wiki picks the stretch of that spectrum it wants to live on.

## Anonymous

The lightest option carries no account at all. The edit is credited to a derived nickname, no personal data is kept, and the contributor never signs anything. It has its own page, because the privacy details matter: [[anonymous-editing|Anonymous editing]].

## Sign in with GitHub

For contributors who already have a GitHub account — common on technical or open-source wikis — this is the quickest way to attach a real identity. They click *Sign in with GitHub*, approve once, and from then on their edits carry their GitHub name and avatar. It reuses GitHub's own login, so there is no new password and nothing for the wiki to store.

## Sign in with a Wikigit account

Not everyone has GitHub, and a wiki shouldn't have to require it. A **Wikigit account** is the option for everyone else, and it is deliberately password-free. You enter your email, a one-time code arrives, you type it back, and you're in. There is nothing to invent and nothing to forget.

Behind that is a small, separate sign-in service — its own Bun program, distinct from the [[how-it-works|Engine]] that saves edits. wikigit.org runs one that any wiki can point at, or, if you'd rather own the whole stack, you can host it yourself. The email address stays with that service and never reaches the wiki's pages or history.

## What signing in gives you

Staying anonymous is fine, but signing in earns a contributor a few things an anonymous nickname can't hold.

- **Credit** — a real name and picture on every edit.
- **A profile** — a page of your own and a running list of everything you've contributed.
- **Reputation** — accepted edits build standing over time, and at a certain point your changes start [[editing-model|publishing without review]]. Trust is earned by contributing, which is why a brand-new account gets no head start over an anonymous editor.

## What's planned

A later option will let an organisation plug in its *own* login — the company or community account system people already use — so they sign in with credentials they have rather than making anything new. It isn't available yet; today the choices are anonymous, GitHub, and the Wikigit account.

## See also

- [[anonymous-editing|Anonymous editing]] — the no-account path.
- [[help/signing-in|Signing in]] — how to turn each option on for your wiki.
- [[trust-and-moderation|Trust and moderation]] — how reputation turns into publishing rights.

{{shared/concepts-navbox}}
