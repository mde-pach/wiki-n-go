// Build-time access to the Markdown under content/. One eager glob powers both
// the static-path lists and the raw content the read/edit views server-render.
const PREFIX = "../../content/";

const raw = import.meta.glob("../../content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function contentSlugs(): string[] {
  return Object.keys(raw).map((p) => p.slice(PREFIX.length).replace(/\.md$/, ""));
}

export function rawPage(slug: string | undefined): string | undefined {
  return slug ? raw[`${PREFIX}${slug}.md`] : undefined;
}

export function staticPaths(): { params: { slug: string } }[] {
  return contentSlugs().map((slug) => ({ params: { slug } }));
}
