---
title: Accounts service
description: Run the optional sign-in service so contributors without GitHub can have an account.
---

# Accounts service

This is an **optional** piece, and you only need it if you want to offer **Wikigit accounts** — the password-free, email-based sign-in for people who don't use GitHub. If anonymous editing plus GitHub sign-in is enough for your wiki, you can skip this entirely.

## What it is

The accounts service is a small program that handles one job: signing people in by email. Someone enters their email, it sends them a one-time code, and they're in. It keeps the list of accounts and nothing else — no passwords to manage, and email addresses never reach your wiki.

One accounts service can sign people in to **many** wikis, so you don't need a separate one per wiki.

## Two ways to use it

- **Use a shared one.** The simplest path: point your wiki at an existing accounts service (for example, a community-run one) and you're done — nothing to host.
- **Run your own.** If you'd rather be self-contained, you can run the service yourself.

## Running your own, in short

It needs two things:

1. **Somewhere to run.** It's a small program that runs on any basic web host that can keep a program online (many have a one-click option for this kind of thing).
2. **A way to send email.** Since it signs people in by emailing a code, it needs an email sender — your own mail service, or any standard email-sending provider.

Once it's running, you point your wiki at its address, and "Sign in with Wikigit" appears alongside the other options.

## Is it worth it?

Offer Wikigit accounts when you expect contributors who aren't on GitHub and you want them to be able to sign in for credit and reputation. For a developer-leaning community, GitHub sign-in usually covers everyone and this service isn't needed. There's no harm in adding it later — your wiki works the same with or without it.
