---
description: Adding images to Wikigit pages — plain captioned figures, and
  floating images that text wraps around like an encyclopedia article.
kicker: Concepts
protection: auto
hatnote: For the syntax, see [[help/formatting|Formatting]].
infobox:
  A plain image: Becomes a captioned figure
  Floating: Text wraps around it
  Position: Left, right, or centered
  On phones: Floats drop to full width
tags:
  - Concepts
  - Editing
---

# Images and media

A wiki is mostly text, but the right picture earns its place — a diagram, a screenshot, a photo of the thing being described. Wikigit keeps images simple to add and makes them behave the way they do in a printed reference, where a picture sits to the side and the words flow past it. The images on this page are doing exactly what the page is explaining.

## A plain picture

Drop an image onto its own line and Wikigit turns it into a neat, centered figure with its caption underneath — no extra markup needed. The description you give the image does double duty: it's the caption, and it's what a screen reader announces or what shows if the image fails to load, so it's worth writing properly rather than leaving blank.

![The Wikimedia Commons logo, shown here as a plain centered figure.](https://commons.wikimedia.org/wiki/Special:FilePath/Commons-logo.svg)

## A floating picture

::image[Earth photographed from Apollo 17 in 1972. A floating image sits to one side and lets the text wrap around it.]{src=https://commons.wikimedia.org/wiki/Special:FilePath/The_Earth_seen_from_Apollo_17.jpg align=right width=240}

The photo of Earth here is *floated*. Instead of sitting in the column on its own, it tucks against one side and lets the text run alongside it, which is how an encyclopedia article reads. You choose the side, cap how wide it gets, and — for tall portrait images — ask for a narrower default so it doesn't dominate the column.

It's also responsive without any thought from you. On a narrow screen there isn't room to wrap text beside a picture, so floated images quietly drop to full width and stack with the text instead.

## Where images live

Wikigit doesn't run a media library of its own; an image is referenced by its web address. In practice that means pointing at an image hosted somewhere stable — your repository, a [[w:Wikimedia Commons|Wikimedia Commons]] file, or any reliable host — and the page renders it in place. There's nothing to upload into a separate system and nothing extra to back up.

## See also

- [[help/formatting|Formatting]] — the exact syntax for both kinds of image.
- [[anatomy-of-a-page|Anatomy of a page]] — the other visual parts of a page, like the infobox.
- [[links-and-references|Links and references]] — linking, citing, and connecting pages.


{{shared/concepts-navbox}}
