---
description: Categories group related pages so a wiki can be browsed by topic.
  They combine, they nest, and they keep housekeeping apart from subjects.
kicker: Concepts
protection: auto
infobox:
  Set on: A page, in its settings
  Browse at: A category's own page
  Combine: View pages in two at once
  Nest: A category inside a broader one
tags:
  - Concepts
  - Organization
  - Categories
---

# Categories

A **category** is a topic that pages can be filed under, so a reader can move through the wiki by subject instead of by guessing page names. A page joins a category by listing it in [[reference/page-settings|its settings]], and the category gets a page of its own that lists every member. If you look at the very bottom of *this* page, you'll see the categories it belongs to shown as small chips — that's the feature describing itself.

Crucially, nobody maintains those lists by hand. A category's membership is computed from the pages that claim it, so adding a page to a category is a one-line change on the page, and the category page updates itself.

## Combining

Because membership is computed, categories can be intersected. Ask for the pages that are in *two* categories at once and you get exactly the overlap — a quick way to narrow a large topic without building a separate list for every combination. A wiki about cooking might cross "desserts" with "gluten-free" and get just the pages that are both.

## Nesting

Categories can also contain categories. A page can be a member of one category and itself *be* a category that other pages join, which lets broad topics hold narrower ones — "vehicles" over "cars" over "electric cars." There's no rigid tree to set up in advance; the hierarchy is just categories pointing at categories, and it grows as the wiki does.

## Housekeeping kept separate

Not every grouping is a subject. Some are notes-to-self about the state of a page — "needs sources," "draft," "to be merged." Wikigit treats these **maintenance categories** as a class apart and keeps them out of the way of real topic categories, so a reader browsing by subject never trips over the wiki's internal to-do list. Those same maintenance groupings feed the [[special-pages|special pages]] that surface what needs attention.

## See also

- [[help/organizing|Organizing]] — putting categories to work as your wiki grows.
- [[reference/page-settings|Page settings]] — where a page's categories are set.
- [[links-and-references|Links and references]] — the other half of how pages connect.

{{shared/concepts-navbox}}
