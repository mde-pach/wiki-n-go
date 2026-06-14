---
kicker: Guide
description: Headings, links, pictures, references, and more — with examples you can copy.
protection: auto
tags:
  - Documentation
  - Editing
---

# Formatting

Wikigit pages are written in [[w:Markdown|Markdown]], a simple way to format text by typing a few plain symbols. You don't need to memorize it — the editor previews your page as you go, and the basics below cover almost everything.

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

Link to another page in your wiki by putting its name in double brackets:

```
See [[Getting started]] for more.
```

Want different link text? Add it after a bar:

```
See our [[getting-started|quick start guide]].
```

If a page doesn't exist yet, its link shows up **red**. Clicking a red link offers to create that page — a handy way to grow your wiki.

To link to **Wikipedia**, put `w:` in front:

```
The [[w:Coffee|coffee]] article on Wikipedia.
```

For any other website, use a normal link:

```
[Visit the site](https://example.com)
```

## Pictures

```
![A description of the picture](https://example.com/photo.jpg)
```

The description is shown if the image can't load and helps screen readers. A picture on its own line becomes a neat captioned figure automatically.

### Floating pictures

To float a picture to one side so the text wraps around it — like an encyclopedia article — put it on its own line with the `::image` form:

```
::image[Coffee flowers in bloom]{src=https://example.com/coffee.jpg align=right}
```

The text in `[...]` is the caption. Inside `{...}`:

- `src=` — the picture address (required).
- `align=` — `right`, `left`, `center`, or `none`. Defaults to `right`.
- `width=` — a cap on how wide it gets, e.g. `width=320` (pixels) or `width=50%`. A picture is never blown up past its own size.
- `upright` — a narrower default, handy for tall (portrait) pictures.

On narrow screens floated pictures drop to full width automatically. For a plain centered picture that shows in any Markdown tool, use the `![...](...)` form above; the `::image` form is read here on the wiki.

## References and citations

To back up a fact with a source, add a footnote. Write a marker where the fact is, and the note itself anywhere on the page:

```
Coffee is popular worldwide.[^1]

[^1]: Source: the coffee almanac, 2024.
```

The marker becomes a small number; the source is collected at the bottom of the page, and hovering the number shows it. Cite the same source twice and it's listed once with a link back to each mention.

For a tidy, formatted citation, use a citation template:

```
{{cite|url=https://example.com|title=All About Coffee|author=J. Bean|date=2024}}
```

## Mentioning people

Type `@` and a contributor's name to link to them — for example `@some-editor`. It's a friendly way to credit or point to someone in a discussion.

## Reusing a page inside another

To pull one page's content into another (handy for a shared notice or a snippet you reuse), put its name in double braces on its own line:

```
{{shared/free-and-yours}}
```

## A few tips

- Use headings to give long pages a structure — Wikigit builds the table of contents from them automatically.
- Keep one idea per paragraph; short paragraphs read better on screens.
- Preview as you write — the editor shows the finished page beside your text.

For page-level options like the summary, categories, and notices, see [[settings|Settings]].
