import { config } from "../config";

export interface Comment {
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  bodyHtml: string;
  createdAt: string;
  url: string;
}

export async function listComments(slug: string): Promise<Comment[]> {
  const res = await fetch(
    `${config.workerUrl}/comments?slug=${encodeURIComponent(slug)}`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Failed to load comments (HTTP ${res.status}).`);
  return ((await res.json()) as { comments: Comment[] }).comments;
}

export async function postComment(
  slug: string,
  body: string,
  token?: string,
): Promise<void> {
  const res = await fetch(`${config.workerUrl}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, body, token }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
}
