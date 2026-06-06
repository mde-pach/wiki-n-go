import { config } from "../config";

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
  const res = await fetch(`${config.workerUrl}/cite?q=${encodeURIComponent(query)}`);
  const data = (await res.json()) as Partial<CiteResult> & { error?: string };
  if (!res.ok || !data.citation)
    throw new Error(data.error ?? `Lookup failed (${res.status})`);
  return data as CiteResult;
}
