---
protection: open
tags:
  - demo
  - sandbox
---

# Transclusion demo

This page pulls a shared "navbox" block in from another page using
`{{sandbox/coffee-nav}}` on its own line. The block below is **not** written
here — it's the body of [[sandbox/coffee-nav]], inlined at read time:

{{sandbox/coffee-nav}}

Editing the navbox page updates every page that transcludes it, with no site
rebuild. A missing target shows a "create it" prompt instead, and a page that
transcludes one of its own ancestors is skipped rather than looping.
