import {
  type Citation,
  type CiteQuery,
  classify,
  crossrefCitation,
  formatMarkdown,
  htmlMetaCitation,
  openLibraryCitation,
} from "../citelib";
import { HttpError } from "../http";
import { cached } from "../kv";
import type { Env } from "../types";

const CITE_TTL_MS = 86_400_000;

export function cite(env: Env, input: string) {
  const query = classify(input);
  if (!query) throw new HttpError(400, "Enter a URL, DOI, or ISBN.");
  return cached(env, `cite:${query.kind}:${query.value}`, CITE_TTL_MS, async () => {
    const citation = await lookupCitation(env, query);
    return { citation, markdown: formatMarkdown(citation) };
  });
}

async function lookupCitation(env: Env, query: CiteQuery): Promise<Citation> {
  const ua = `${env.REPO_NAME}-worker (citation lookup)`;
  if (query.kind === "doi") {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(query.value)}`,
      { headers: { "User-Agent": ua, Accept: "application/json" } },
    );
    if (!res.ok) throw new HttpError(404, "Couldn't resolve that DOI.");
    const json = (await res.json()) as {
      message?: Parameters<typeof crossrefCitation>[0];
    };
    return crossrefCitation(json.message ?? {}, query.value);
  }
  if (query.kind === "isbn") {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${query.value}&format=json&jscmd=data`,
      { headers: { "User-Agent": ua } },
    );
    const json = (await res.json()) as Record<
      string,
      Parameters<typeof openLibraryCitation>[0]
    >;
    const book = json[`ISBN:${query.value}`];
    if (!book) throw new HttpError(404, "Couldn't find that ISBN.");
    return openLibraryCitation(book, query.value);
  }
  assertFetchableUrl(query.value);
  const res = await fetch(query.value, {
    headers: { "User-Agent": ua },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(422, "Couldn't fetch that URL.");
  const html = (await res.text()).slice(0, 262_144);
  return htmlMetaCitation(html, res.url || query.value);
}

// Block the obvious SSRF targets; the Worker fetches arbitrary user-supplied URLs.
function assertFetchableUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new HttpError(400, "Only http(s) URLs are supported.");
  const host = url.hostname.toLowerCase();
  const blocked =
    /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|\[::1\])/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local");
  if (blocked) throw new HttpError(400, "Refusing to fetch a private address.");
}
