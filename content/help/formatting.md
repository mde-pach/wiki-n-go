---
description: The syntax for headings, links, images, references and more — written
  out with examples you can copy straight into a page.
kicker: Help
protection: auto
hatnote: For the ideas behind these, see [[links-and-references|Links and references]]
  and [[media|Images and media]].
tags:
  - Guides
  - Editing
  - Reference
---

# Formatting

Wikigit pages are written in [[w:Markdown|Markdown]], a way of formatting text by typing a few plain symbols. You don't have to memorise it — the editor previews your page as you write — but the examples below cover almost everything you'll reach for. This is the one page where the syntax is shown as code rather than rendered; the rendered versions live on [[links-and-references|Links and references]] and [[media|Images and media]].

## The basics

```
# Big heading
## Smaller heading

**bold**, *italic*, and `code`.

- a bullet
- another bullet

1. a numbered item
2. the next one

> A quote.
```

Leave a blank line between paragraphs.

## Linking to other pages

Put a page's name in double brackets:

```
See [[Getting started]] for more.
```

Want different link text? Add it after a bar:

```
See our [[getting-started|quick start guide]].
```

A link to a page that doesn't exist yet shows up **red**, and clicking it offers to create that page. To link to Wikipedia, put `w:` in front:

```
The [[w:Coffee|coffee]] article on Wikipedia.
```

For any other site, use a normal link:

```
[Visit the site](https://example.com)
```

## Images

```
![A description of the picture](https://example.com/photo.jpg)
```

A picture on its own line becomes a centered captioned figure. To float one to the side so the text wraps around it, use the `::image` form:

```
::image[Coffee flowers in bloom]{src=https://example.com/coffee.jpg align=right}
```

The `[...]` is the caption. Inside `{...}`: `src=` is the image address (required); `align=` is `right`, `left`, `center`, or `none`; `width=` caps the size, like `width=320` or `width=50%`; and `upright` gives a narrower default for tall pictures. See [[media|Images and media]] for the rendered result.

## References and citations

Back up a fact with a footnote. Put a marker where the fact is, and the note anywhere on the page:

```
Coffee is popular worldwide.[^1]

[^1]: Source: the coffee almanac, 2024.
```

The marker becomes a small number and the source collects at the foot of the page. For a formatted citation, use a template:

```
{{cite|url=https://example.com|title=All About Coffee|author=J. Bean|date=2024}}
```

## Mentioning people

Type `@` and a contributor's name — `@some-editor` — to link to them. It's the friendly way to credit someone or point to them in a [[talk-pages|discussion]].

## Reusing one page inside another

To pull a page's content into another (handy for a shared notice), put its name in double braces on its own line:

```
{{shared/free-and-yours}}
```

## A few tips

- Use headings to structure a long page — Wikigit builds the table of contents from them.
- Keep one idea per paragraph; short paragraphs read better on screens.
- Preview as you write — the finished page sits right beside your text.

For page-level options like the summary, categories, and notices, see [[reference/page-settings|Page settings]].

{{shared/concepts-navbox}}
