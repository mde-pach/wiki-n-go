import { config } from "../config";

export interface EditResult {
  prUrl: string;
  author: string;
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
