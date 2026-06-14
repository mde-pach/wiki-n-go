---
description: How Wikigit pages connect — wikilinks between pages, red links to
  pages not yet written, links out to Wikipedia, mentions, and cited sources.
kicker: Concepts
protection: auto
hatnote: For the exact syntax to type, see [[help/formatting|Formatting]].
infobox:
  Internal links: "[[Double brackets]]"
  Missing pages: Show up red
  Out to Wikipedia: A "w:" prefix
  Sources: Footnotes and citations
tags:
  - Concepts
  - Editing
---

# Links and references

Links are what turn a pile of pages into a wiki. Wikigit makes the internal ones cheap to write and gives a page a few more ways to point outward — to a page that doesn't exist yet, to [[w:Wikipedia|Wikipedia]], to a contributor, or to a source that backs up a claim. This page uses every one of them as it describes them.

## Linking between pages

You link to another page by putting its name in double brackets. The link in the first paragraph above to Wikipedia, and the ones at the foot of this page, are all written that way. You can show different text by adding it after a bar, so a link can read naturally inside a sentence instead of as a bare page name.

## Red links

A link to a page that hasn't been written yet still works — it just renders **red**. Here's one now: [[a-page-not-yet-written]]. Clicking a red link offers to create the page it points at, which turns out to be one of the most natural ways a wiki grows. You write the article you wish existed, link to the ones it *should* connect to, and the red links become a to-do list of pages waiting to be filled in.

## Out to Wikipedia

For a general concept that Wikipedia already covers well, there's no point keeping a local stub. Putting `w:` in front of a link sends it there instead — [[w:Hyperlink|hyperlink]], [[w:Markdown|Markdown]], [[w:Wiki|wiki]] — so a reader can follow the background without you having to write or maintain it.

## Mentioning people

Writing an `@` in front of a contributor's name links to them — to a signed-in editor's profile, or to an [[anonymous-editing|anonymous]] editor's contributions. It's the ordinary way to credit someone or point to them in a [[talk-pages|discussion]].

## Citing sources

A reference wiki lives or dies on whether its claims can be checked, so Wikigit supports footnoted sources. A marker in the text becomes a small number, and the source is collected at the foot of the page.[^example] Cite the same source twice and it's listed once, with a link back to each place it was used.[^example] For a tidier, formatted reference there's a citation template, which is what produced this one:

{{cite|url=https://en.wikipedia.org/wiki/Help:Referencing_for_beginners|title=Referencing for beginners|author=Wikipedia contributors|date=2024}}

## Backlinks

Links run both ways. For any page, Wikigit can show what links *to* it — its backlinks — which is how you find the pages that mention a topic, spot an article nothing points at, and keep the web of connections from quietly fraying as the wiki changes.

## See also

- [[help/formatting|Formatting]] — the syntax for all of the above, with examples to copy.
- [[categories|Categories]] — grouping pages by topic rather than linking them one to one.
- [[special-pages|Special pages]] — reports built from the link graph.

## References

[^example]: This footnote is a live example of the feature this section describes.

{{shared/concepts-navbox}}
