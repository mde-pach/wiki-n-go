import { config } from "../config";

export interface EditResult {
  author: string;
  live: boolean; // true → published straight to the live branch; false → opened a PR
  prUrl?: string; // present when live === false
  url?: string; // commit URL when live === true
}

export async function submitEdit(
  slug: string,
  content: string,
  token?: string,
  summary?: string,
): Promise<EditResult> {
  const res = await fetch(`${config.workerUrl}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, content, token, summary }),
  });
  const data = (await res.json()) as Partial<EditResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as EditResult;
}
