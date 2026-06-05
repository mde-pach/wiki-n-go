import { config } from "../config";
import { authHeaders } from "./auth";

export interface Comment {
  id: string;
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  bodyHtml: string;
  createdAt: string;
  url: string;
  replyTo: string | null;
}

export interface Topic {
  id: string;
  title: string;
  author: string;
  isAnon: boolean;
  avatarUrl: string | null;
  createdAt: string;
  replyCount: number;
  lastAt: string;
}

export interface Thread {
  id: string;
  title: string;
  root: Comment;
  comments: Comment[];
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function listTopics(slug: string): Promise<Topic[]> {
  const res = await fetch(
    `${config.workerUrl}/topics?slug=${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  return (await readJson<{ topics: Topic[] }>(res)).topics;
}

export async function getThread(id: string): Promise<Thread> {
  const res = await fetch(`${config.workerUrl}/topic?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  return readJson<Thread>(res);
}

export async function createTopic(
  slug: string,
  title: string,
  body: string,
  token?: string,
): Promise<{ id: string }> {
  const res = await fetch(`${config.workerUrl}/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ slug, title, body, token }),
  });
  return readJson<{ id: string }>(res);
}

export async function postReply(
  topicId: string,
  body: string,
  replyTo?: string,
  token?: string,
): Promise<void> {
  const res = await fetch(`${config.workerUrl}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ topicId, body, replyTo, token }),
  });
  await readJson<{ ok: true }>(res);
}
