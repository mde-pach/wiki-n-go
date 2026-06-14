---
description: Quick answers to common questions about running a Wikigit.
kicker: Reference
protection: auto
tags:
  - Reference
---

# FAQ

**Is it really free?**
For normal use, yes. A wiki hosted on wikigit.org runs at no cost, comfortably covering an ordinary site. Only a very large or very busy wiki might eventually want a paid arrangement.

**Do I need to know how to code?**
No. Creating a wiki is a [[help/create-your-wiki|few clicks]], writing pages is like writing a document, and customising is a matter of changing values in a settings form. There's no programming unless you choose to [[how-it-works|host the Engine yourself]].

**How do people sign in to edit?**
With GitHub or an email-based Wikigit account, so their edits are credited to them. You can also allow [[anonymous-editing|anonymous editing]] the way Wikipedia does, or require everyone to sign in. It's your call — see [[help/signing-in|Signing in]].

**What if someone vandalises a page?**
Nothing is lost: every version is kept. You can undo a bad edit or restore an older one in a click, block the person, and even have obvious vandalism undone automatically. See [[trust-and-moderation|Trust and moderation]].

**Why do edits appear instantly?**
Your pages are just files, and the site reads them live from a CDN. When a change is saved, the next person to open the page sees it — there's no rebuild and no waiting. The [[how-it-works|architecture]] explains why.

**Is my content locked in?**
No. It lives as plain Markdown files — in your own [[w:GitHub|GitHub]] account if you chose that, or movable to it at any time if wikigit.org is hosting it for you. You can download it or keep a copy elsewhere whenever you like.

**Can I use my own web address?**
Yes. A wiki starts at `your-name.wikigit.org`, and you can connect your own domain whenever you like. See [[help/customize|Customize]].

**Can my wiki have more than one language?**
Yes. Pages can have versions in several languages, linked with a switcher for readers. See [[multilingual|Multilingual wikis]].

**What happens during an outage?**
Reading keeps working as long as the reader's host is up. If the [[how-it-works|Engine]] is briefly unavailable, people can still read, and editing resumes when it returns. Since your content is plain files, it's never at risk.

**How many editors can it handle?**
Plenty for a normal community. A single person is rate-limited so they can't flood the wiki, but many people editing at once is no problem.

**Can I move an existing wiki into Wikigit?**
If your content is in Markdown, or can be converted to it, you can bring it in as pages — each page is just a Markdown file in your wiki's folder.

{{shared/free-and-yours}}
