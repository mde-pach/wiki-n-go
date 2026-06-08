---
title: Create your wiki
description: Set up your own Wikigit in a few clicks — no coding required.
---

# Create your wiki

Setting up a Wikigit takes about ten minutes and a few clicks. You'll need a free **GitHub** account (where your pages will live) and a free **Cloudflare** account (which runs the part that saves edits). No coding required — the setup pages fill in the technical bits for you.

Your wiki has two pieces, and each one sets up with a button:

1. **The website** — what visitors read.
2. **The editor service** — the small helper that saves people's changes.

## Step 1 — Make your own copy

Start from the Wikigit project on GitHub and choose **Use this template** (or **Fork**). This creates a copy in your own account — pages and all. This copy is *your* wiki; everything you publish is saved here.

## Step 2 — Turn on the website

Your copy comes with everything needed to publish itself. In your copy's **Settings → Pages**, turn Pages on. Within a minute or two your wiki is live at an address like `your-name.github.io/your-wiki`. Visit it — you'll see a working wiki with starter pages.

At this point people can *read* your wiki. Next you'll switch on editing.

## Step 3 — Set up the editor service

Open the project's setup page (linked from your wiki's footer and its README) and follow it. It will:

- connect to your GitHub copy,
- set up the editor service on your Cloudflare account, and
- fill in all the technical settings for you.

You mostly click **Continue** and approve a couple of permissions. When it finishes, it gives you the editor service's address.

## Step 4 — Connect the two

Tell your website where the editor lives by saving that address as a setting in your GitHub copy (the setup page tells you exactly where). That's the last link in the chain — your website now knows where to send edits.

## Step 5 — You're live

Open your wiki and click **Edit** on any page. Make a small change, save it, and watch it appear. That's a complete, working wiki that anyone can read and (if you allow it) edit.

## What's next

- **[Make it yours](customize.md)** — set the name, logo, colors, home page, and a custom web address.
- **[Editing pages](editing.md)** — how you and others write content.
- **[Managing changes](managing.md)** — decide who can edit and how edits are reviewed.

### A note on the "free" parts

Both GitHub and Cloudflare have generous free tiers that comfortably cover a normal wiki — you won't be asked for a card to get started. A very large or very busy wiki may eventually want a paid plan, but most never need one.
