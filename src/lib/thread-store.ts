import { createEffect, createResource, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isServer } from "solid-js/web";
import {
  createTopic,
  getThread,
  listTopics,
  postReply,
  type Thread,
  type Topic,
} from "./comments";

export interface ThreadStore {
  list: Topic[];
  topicsLoaded: () => boolean;
  openId: () => string | undefined;
  thread: () => Thread | undefined;
  toggle: (id: string) => void;
  submitTopic: (
    text: string,
    token: string | undefined,
    title: string,
  ) => Promise<void>;
  submitReply: (
    text: string,
    token: string | undefined,
    parentId: string,
    topicId: string,
  ) => Promise<void>;
}

export function createThreadStore(slug: () => string): ThreadStore {
  const [topics, { refetch: refetchTopics }] = createResource(
    () => (isServer ? undefined : slug()),
    listTopics,
  );
  // Search indexing lags discussion creation, so a just-posted topic is held
  // locally until the search list catches up. `reconcile` keeps the identity of
  // unchanged rows so an open thread doesn't collapse when the list refreshes.
  const [extra, setExtra] = createSignal<Topic[]>([]);
  const [list, setList] = createStore<Topic[]>([]);
  createEffect(() => {
    const fetched = topics();
    if (fetched === undefined) return;
    const seen = new Set(fetched.map((t) => t.id));
    setList(
      reconcile([...extra().filter((t) => !seen.has(t.id)), ...fetched], { key: "id" }),
    );
  });

  const [openId, setOpenId] = createSignal<string>();
  // Cache fetched threads so re-opening a topic is instant — without it the
  // panel blinks back through a skeleton on every open. A cached thread does no
  // network at all; `reconcile` keeps row identity so a post-reply refresh
  // updates in place rather than re-rendering (and re-flashing) the whole tree.
  const [threads, setThreads] = createStore<Record<string, Thread>>({});
  const thread = () => {
    const id = openId();
    return id ? threads[id] : undefined;
  };

  async function loadThread(id: string, force = false) {
    if (!force && threads[id]) return;
    setThreads(id, reconcile(await getThread(id), { key: "id" }));
  }
  function refetchThread() {
    const id = openId();
    if (id) loadThread(id, true);
  }

  function toggle(id: string) {
    const next = openId() === id ? undefined : id;
    setOpenId(next);
    if (next) loadThread(next);
  }

  async function submitTopic(text: string, token: string | undefined, title: string) {
    const { id } = await createTopic(slug(), title, text, token);
    const now = new Date().toISOString();
    setExtra((e) => [
      {
        id,
        title,
        author: "you",
        isAnon: true,
        avatarUrl: null,
        createdAt: now,
        replyCount: 0,
        lastAt: now,
      },
      ...e,
    ]);
    refetchTopics();
    setOpenId(id);
  }

  async function submitReply(
    text: string,
    token: string | undefined,
    parentId: string,
    topicId: string,
  ) {
    await postReply(topicId, text, parentId === topicId ? undefined : parentId, token);
    refetchThread();
  }

  return {
    list,
    topicsLoaded: () => topics() !== undefined,
    openId,
    thread,
    toggle,
    submitTopic,
    submitReply,
  };
}
