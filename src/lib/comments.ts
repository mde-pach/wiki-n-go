import { getJson, postJson } from "./api";

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

export async function listTopics(slug: string): Promise<Topic[]> {
  const data = await getJson<{ topics: Topic[] }>(
    `/topics?slug=${encodeURIComponent(slug)}`,
  );
  return data.topics;
}

export function getThread(id: string): Promise<Thread> {
  return getJson<Thread>(`/topic?id=${encodeURIComponent(id)}`);
}

export function createTopic(
  slug: string,
  title: string,
  body: string,
  token?: string,
): Promise<{ id: string }> {
  return postJson<{ id: string }>("/topic", { slug, title, body, token });
}

export async function postReply(
  topicId: string,
  body: string,
  replyTo?: string,
  token?: string,
): Promise<void> {
  await postJson<{ ok: true }>("/comment", { topicId, body, replyTo, token });
}
