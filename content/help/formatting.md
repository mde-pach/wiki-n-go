---
kicker: Help
protection: maintainer
description: A Markdown primer plus the wiki-specific syntax — wikilinks, footnotes, figures, infoboxes, and more.
tags:
  - Help
infobox:
  Type: Reference
  Audience: Editors
  Reading time: ~5 min
hatnote: New to editing? Start with Editing and contributing.
---

# Formatting and syntax

Pages are written in **Markdown**, with a few wiki-specific extensions. This
page is both a primer and a reference; the right-hand panel and this page's own
source are themselves examples.[^source]

Raw HTML is **not** allowed in pages — use the Markdown below. Bare URLs are
linked automatically, and straight quotes and dashes are smartened for you.

## Text basics

```
**bold**   *italic*   `inline code`

> A blockquote.

- a bullet
- another
  - nested

1. first
2. second
```

## Headings

Start a line with `##` for a section, `###` for a sub-section, `####` for the
level below that. Each heading gets a link anchor and a per-section **edit**
link automatically, is listed in the **table of contents**, and can be
collapsed by the reader — you don't add any of that yourself.

```
## Section title
### Sub-section
```

Don't use a single `#` inside the body: the page's `# Title` is taken from the
top of the file and shown in the page header.

## Links

| You want | Type | Result |
|---|---|---|
| External link | `[text](https://example.com)` | a normal outbound link |
| Internal link | `[[Page name]]` | links to another wiki page |
| Internal, custom label | `[[page-slug\|shown text]]` | same, with your own text |
| Link to a page that doesn't exist | `[[New page]]` | a **red link** inviting creation |
| Link out to Wikipedia | `[[w:Article title]]` | an *interwiki* link, marked as leaving the wiki |

Internal links use the page's slug; `[[Getting started]]` and
`[[getting-started]]` both resolve. A link whose target doesn't exist yet shows
in red — click it to create that page. Use interwiki links like
[[w:Markdown]] for topics already covered well on Wikipedia that you don't want
to maintain a local page for.

## References and footnotes

Add a citation marker with `[^name]`, then define it anywhere in the page. The
markers render as numbered `[1]` citations and collect into a reference list at
the bottom, with hover tooltips and back-links.

```
The claim needs a source.[^study]

[^study]: Author, *Title*, 2024.
```

The **Cite** tool can build a properly formatted reference for you from a URL,
DOI, or ISBN — handy for the definition text.

## Figures

A paragraph that is *only* an image becomes a captioned figure; the alt text is
used as the caption.

```
![A descriptive caption goes here.](https://example.com/photo.jpg)
```

## Tables, code, and quotes

Standard Markdown tables, fenced code blocks (with a language for highlighting),
and `>` blockquotes all work as usual:

````
```ts
const greeting = "hello";
```
````

## Page properties (frontmatter)

Optional settings live in a `---` block at the very top of the file. All fields
are optional; a page with none still renders.

```yaml
---
description: One-line summary for search results and link previews.
tags:
  - Category one
  - Category two
hatnote: A note shown above the article, e.g. linking a related page.
banner:
  kind: warn          # info | warn
  text: A maintenance or status notice shown at the top.
infobox:
  Type: Reference
  Maintainer:
    v: the team
    link: https://example.com
kicker: A small label shown above the title.
redirect: Some other page   # bounce the reader to another page
protection: maintainer       # open | auto | extended | maintainer
---
```

- **tags** become category chips and `/category/<tag>` pages.
- **infobox** renders the fact panel beside the article; a value can be a plain
  string or a `{ v, link, mono }` object for links and monospaced text.
- **protection** sets the minimum trust tier required to edit the page; see
  [[help/editing|Editing and contributing]] for what the tiers mean.

[^source]: View this page's source by clicking **Edit** to see exactly how each
example is written.
