export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  build(title: string): string;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "article",
    label: "Article",
    description: "A lead sentence and the usual sections.",
    build: (title) =>
      `---\nkicker: Article\ntags:\n  - Articles\n---\n\n**${title}** is …\n\n## Overview\n\n## History\n\n## See also\n\n- [[related-page]]\n`,
  },
  {
    id: "guide",
    label: "How-to guide",
    description: "Prerequisites and numbered steps for a task.",
    build: (title) =>
      `---\nkicker: Guide\ntags:\n  - Guides\n---\n\nThis guide explains how to ${title.toLowerCase()}.\n\n## Before you start\n\n## Steps\n\n1. \n2. \n\n## Troubleshooting\n`,
  },
  {
    id: "blank",
    label: "Blank page",
    description: "Start from an empty editor.",
    build: () => "",
  },
];

export function templateById(id: string | null | undefined): PageTemplate {
  return PAGE_TEMPLATES.find((t) => t.id === id) ?? PAGE_TEMPLATES[0];
}
