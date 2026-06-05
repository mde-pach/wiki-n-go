import { config } from "../config";
import { authHeaders } from "./auth";

export interface EditResult {
  author: string;
  live: boolean; // true → published straight to the live branch; false → opened a PR
  prUrl?: string; // present when live === false
  url?: string; // commit URL when live === true
}

export type Tier = "open" | "auto" | "extended" | "maintainer";

export interface WhoAmI {
  author: string;
  tier: Tier;
  avatar: string | null;
  isAnon: boolean;
}

export async function getWhoami(): Promise<WhoAmI> {
  const res = await fetch(`${config.workerUrl}/whoami`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as WhoAmI;
}

export async function submitEdit(
  slug: string,
  content: string,
  token?: string,
  summary?: string,
): Promise<EditResult> {
  const res = await fetch(`${config.workerUrl}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ slug, content, token, summary }),
  });
  const data = (await res.json()) as Partial<EditResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as EditResult;
}
