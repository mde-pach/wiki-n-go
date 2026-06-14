export type CiteKind = "doi" | "isbn" | "url";

export interface Citation {
  kind: CiteKind;
  title: string;
  authors: string[];
  container: string;
  year: string;
  url: string;
}

export interface CiteQuery {
  kind: CiteKind;
  value: string;
}

const DOI_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,}\/\S+)$/i;

export function classify(input: string): CiteQuery | null {
  const s = input.trim();
  if (!s) return null;
  const doi = s.match(DOI_RE);
  if (doi) return { kind: "doi", value: doi[1] };
  const isbn = s.replace(/[\s-]/g, "");
  if (/^(?:97[89]\d{10}|\d{9}[\dxX])$/.test(isbn))
    return { kind: "isbn", value: isbn.toUpperCase() };
  if (/^https?:\/\//i.test(s)) return { kind: "url", value: s };
  return null;
}

interface CrossrefMessage {
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  publisher?: string;
  issued?: { "date-parts"?: number[][] };
  URL?: string;
}

export function crossrefCitation(msg: CrossrefMessage, doi: string): Citation {
  const authors = (msg.author ?? [])
    .map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean) as string[];
  return {
    kind: "doi",
    title: msg.title?.[0]?.trim() || doi,
    authors,
    container: msg["container-title"]?.[0] ?? msg.publisher ?? "",
    year: String(msg.issued?.["date-parts"]?.[0]?.[0] ?? ""),
    url: msg.URL ?? `https://doi.org/${doi}`,
  };
}

interface OpenLibraryBook {
  title?: string;
  authors?: { name?: string }[];
  publishers?: { name?: string }[];
  publish_date?: string;
  url?: string;
}

export function openLibraryCitation(book: OpenLibraryBook, isbn: string): Citation {
  return {
    kind: "isbn",
    title: book.title?.trim() || `ISBN ${isbn}`,
    authors: (book.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
    container: book.publishers?.[0]?.name ?? "",
    year: book.publish_date?.match(/\d{4}/)?.[0] ?? "",
    url: book.url ?? `https://openlibrary.org/isbn/${isbn}`,
  };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#039;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;|&#0?39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, prop: string): string {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const after = new RegExp(
    `<meta[^>]+(?:property|name)=["']${esc}["'][^>]*\\scontent=["']([^"']*)["']`,
    "i",
  );
  const before = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`,
    "i",
  );
  return (html.match(after)?.[1] ?? html.match(before)?.[1] ?? "").trim();
}

export function htmlMetaCitation(html: string, url: string): Citation {
  const meta = (p: string) => metaContent(html, p);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = meta("og:title") || meta("twitter:title") || titleTag || url;
  const site = meta("og:site_name") || hostOf(url);
  const author = meta("author") || meta("article:author") || meta("citation_author");
  const date =
    meta("article:published_time") ||
    meta("citation_publication_date") ||
    meta("date") ||
    "";
  return {
    kind: "url",
    title: decodeEntities(title),
    authors: author ? [decodeEntities(author)] : [],
    container: decodeEntities(site),
    year: date.match(/\d{4}/)?.[0] ?? "",
    url,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function formatMarkdown(c: Citation): string {
  const parts: string[] = [];
  if (c.authors.length) parts.push(`${c.authors.join(", ")}.`);
  parts.push(`"${c.title}."`);
  if (c.container) parts.push(`*${c.container}*${c.year ? "," : "."}`);
  if (c.year) parts.push(`${c.year}.`);
  parts.push(`<${c.url}>`);
  return parts.join(" ");
}
