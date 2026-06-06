import { getJson } from "./api";

export interface Citation {
  kind: "doi" | "isbn" | "url";
  title: string;
  authors: string[];
  container: string;
  year: string;
  url: string;
}

export interface CiteResult {
  citation: Citation;
  markdown: string;
}

export async function lookupCitation(query: string): Promise<CiteResult> {
  const data = await getJson<Partial<CiteResult>>(
    `/cite?q=${encodeURIComponent(query)}`,
    { cache: "default", auth: false },
  );
  if (!data.citation) throw new Error("Lookup failed");
  return data as CiteResult;
}
