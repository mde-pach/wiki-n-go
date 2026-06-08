---
title: FAQ
description: Quick answers to common questions about running a Wikigit.
---

# FAQ

**Is it really free?**
Yes, for normal use. Your wiki runs on the free tiers of GitHub and Cloudflare, which comfortably cover an ordinary wiki. Only a very large or very busy site might eventually want a paid plan.

**Do I need to know how to code?**
No. Setting up a wiki is a few clicks (see [Create your wiki](create-your-wiki.md)), and writing pages is like writing a document. Customizing involves changing a few values in a settings file — no programming.

**Do people need an account to edit?**
No. Anyone can edit anonymously by default. Signing in is optional, for people who want credit for their work. You can require sign-in if you prefer.

**What if someone vandalizes a page?**
Nothing is ever lost — every version is kept. You can undo a bad edit or restore an older version in a click, block the person, and even have obvious vandalism undone automatically. See [Managing changes](managing.md).

**Why do edits appear instantly?**
Your pages are just files, and the website reads them live. When a change is saved, the next person to open the page sees it — there's no rebuild or waiting.

**Is my content locked in?**
Not at all. Everything lives in your own GitHub account as plain text files. You can download it, move it, or keep a copy elsewhere at any time.

**Can I use my own web address?**
Yes. Your wiki starts on a free address, and you can connect your own domain whenever you like. See [Make it yours](customize.md#a-custom-web-address).

**Can my wiki have more than one language?**
Yes. Pages can have versions in several languages, linked with a switcher for readers. See [Organizing your wiki](organizing.md#multiple-languages).

**What happens if GitHub or Cloudflare has an outage?**
Reading keeps working as long as the website is up. If the editor service is briefly unavailable, people can still read; editing resumes when it's back. Because your content is plain files in GitHub, it's never at risk.

**How many editors can it handle?**
Plenty for a normal community. There's a built-in limit on how fast a single person can edit (to stop spam), but many people editing at once is no problem.

**Can I move an existing wiki into Wikigit?**
If your content is in Markdown (or can be converted to it), you can bring it in as pages. Each page is just a Markdown file in your wiki's folder.
