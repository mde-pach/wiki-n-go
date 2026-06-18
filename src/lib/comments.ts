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

// Direct children of `parent` when rebuilding the comment tree from the flat
// reply-to markers (GitHub Discussions nest only one level, so we rebuild
// arbitrary depth client-side). At the root, a comment is a child when it has no
// parent, points at the root, OR points at a parent that isn't in the set (an
// orphan whose target was deleted) — so no comment is ever silently dropped.
export function childrenOf(
  parent: Comment,
  isRoot: boolean,
  all: Comment[],
): Comment[] {
  const known = new Set(all.map((c) => c.id));
  return all.filter((c) =>
    isRoot
      ? !c.replyTo || c.replyTo === parent.id || !known.has(c.replyTo)
      : c.replyTo === parent.id,
  );
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
): Promise<Topic> {
  return postJson<Topic>("/topic", { slug, title, body, token });
}

export async function postReply(
  topicId: string,
  body: string,
  replyTo?: string,
  token?: string,
): Promise<void> {
  await postJson<{ ok: true }>("/comment", { topicId, body, replyTo, token });
}
