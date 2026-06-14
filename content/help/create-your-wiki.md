---
description: Create a Wikigit in about a minute — sign in, pick a name, choose
  where the content lives, and you're live. No coding, no servers to set up.
kicker: Help
protection: auto
hatnote: For how all of this works underneath, see [[how-it-works|Architecture]].
infobox:
  Time needed: About a minute
  Coding: None
  You'll need: A sign-in (GitHub or email)
  Your wiki lives at: name.wikigit.org
  Cost: Free
tags:
  - Guides
  - Getting started
---

# Create your wiki

Making a Wikigit is quick, and most of the technical work that used to be involved is now done for you. You don't set up a server, you don't wire two services together, and you don't need to know any code. You pick a name and choose where your pages should live.

## The short version

Go to the **Create** page on wikigit.org and you'll be walked through three things.

1. **Sign in.** Use GitHub if you have it, or just your email — a one-time code signs you in, with no password to make. Email is there precisely so you can do this without a GitHub account.
2. **Pick a name.** Type a name for your wiki and it checks, as you type, whether `your-name.wikigit.org` is free. That address is where your wiki will live.
3. **Choose where your content lives.** Two options, explained below. Submit, and you're taken straight to your new, working wiki.

That's the whole setup. Everything after this — writing pages, changing the look, inviting others — happens inside the wiki you just made.

## Where your content lives

This is the one real decision, and it's the question of who holds the files.

**Host it for me.** wikigit.org keeps your pages in a repository on your behalf. You need nothing but your sign-in, and there's nothing to manage. This is the easiest path and the right one for most people. If you ever want the files under your own account, you can move them out later — you're not locked in.

**Use my own GitHub repo.** Your pages live in a [[w:GitHub|GitHub]] repository you own. You install the Wikigit app on that repo, enter its name, and wikigit.org serves your wiki from it. Pick this if you already live in GitHub or want the content unambiguously in your own hands from day one. Either way the [[identity|identity]] and editing experience is the same.

## After you're live

Open any page and click **Edit** to prove it works — change a line, save, watch it appear. Then make it yours:

- [[help/customize|Customize]] — set the name, tagline, look, home page, and a custom web address.
- [[help/editing|Editing pages]] — how you and others write content.
- [[help/signing-in|Signing in]] — choose which sign-in options your contributors get.
- [[trust-and-moderation|Trust and moderation]] — decide how open the wiki is and how edits are reviewed.

## Running the whole thing yourself

Everything above uses wikigit.org to host the moving part for you. If you'd rather own the entire stack, you can: the [[how-it-works|Engine]] is a small Bun server you can run on your own host behind a reverse proxy, with the reader served as static files from anywhere. That's more work and more control, and it's the exception, not the path most wikis take.

{{shared/free-and-yours}}
