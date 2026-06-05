import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isServer } from "solid-js/web";
import { config } from "../config";
import {
  type Comment,
  createTopic,
  getThread,
  listTopics,
  postReply,
  type Thread,
  type Topic,
} from "../lib/comments";
import { slugFromLocation } from "../lib/slug";
import { renderTurnstile, resetTurnstile } from "../lib/turnstile";
import { errMessage } from "../lib/util";
import { Icons } from "./Icons";

type ComposerState =
  | { mode: "topic" }
  | { mode: "reply"; parentId: string; topicId: string }
  | null;

export default function Discussion(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
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
  const [composer, setComposer] = createSignal<ComposerState>(null);

  function toggle(id: string) {
    setComposer(null);
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
    setComposer(null);
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
    setComposer(null);
    refetchThread();
  }

  return (
    <section class="talk">
      <div class="talk-head">
        <h2 class="discussion-title">Discussion</h2>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={() =>
            setComposer(composer()?.mode === "topic" ? null : { mode: "topic" })
          }
        >
          <Icons.Edit />
          New topic
        </button>
      </div>

      <div class="notice notice-info talk-guidelines">
        <Icons.Info />
        <span>
          This is the place to discuss the page — propose changes, ask questions, and
          reach consensus. Be civil, stay on topic, and sign nothing: every post is
          attributed automatically.
        </span>
      </div>

      <Show when={composer()?.mode === "topic"}>
        <Composer
          withTitle
          submitLabel="Add topic"
          placeholder="Start the discussion…"
          onSubmit={submitTopic}
          onCancel={() => setComposer(null)}
        />
      </Show>

      <Show when={topics() !== undefined} fallback={<TopicSkeleton />}>
        <Show
          when={list.length > 0}
          fallback={<p class="wiki-status">No topics yet — start the discussion.</p>}
        >
          <ul class="topic-list">
            <For each={list}>
              {(t) => (
                <li class="topic">
                  <button
                    type="button"
                    class="topic-summary"
                    aria-expanded={openId() === t.id}
                    onClick={() => toggle(t.id)}
                  >
                    <Icons.Chevron
                      class="topic-caret"
                      style={{
                        transform: openId() === t.id ? "rotate(0)" : "rotate(-90deg)",
                      }}
                    />
                    <span class="topic-title">{t.title}</span>
                    <span class="topic-meta">
                      {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"} ·{" "}
                      {timeAgo(t.lastAt)}
                    </span>
                  </button>

                  <Show when={openId() === t.id}>
                    <div class="thread">
                      <Show when={thread()} fallback={<CommentSkeleton />}>
                        {(data) => (
                          <>
                            <div class="thread-meta">
                              {data().comments.length + 1}{" "}
                              {data().comments.length === 0 ? "message" : "messages"} ·{" "}
                              {participantsOf(data())}{" "}
                              {participantsOf(data()) === 1
                                ? "participant"
                                : "participants"}
                            </div>
                            <CommentView comment={data().root} root />
                            <ReplyTools
                              comment={data().root}
                              topicId={data().id}
                              composer={composer()}
                              setComposer={setComposer}
                              onSubmit={submitReply}
                            />
                            <Replies
                              parent={data().root}
                              topicId={data().id}
                              comments={data().comments}
                              depth={0}
                              composer={composer()}
                              setComposer={setComposer}
                              onSubmit={submitReply}
                            />
                          </>
                        )}
                      </Show>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}

interface TreeProps {
  topicId: string;
  comments: Comment[];
  composer: ComposerState;
  setComposer: (s: ComposerState) => void;
  onSubmit: (
    text: string,
    token: string | undefined,
    parentId: string,
    topicId: string,
  ) => Promise<void>;
}

function childrenOf(parent: Comment, isRoot: boolean, all: Comment[]): Comment[] {
  const known = new Set(all.map((c) => c.id));
  return all.filter((c) =>
    isRoot
      ? !c.replyTo || c.replyTo === parent.id || !known.has(c.replyTo)
      : c.replyTo === parent.id,
  );
}

function Replies(props: TreeProps & { parent: Comment; depth: number }) {
  const isRoot = () => props.parent.replyTo === null && props.depth === 0;
  const kids = () => childrenOf(props.parent, isRoot(), props.comments);
  return (
    <Show when={kids().length > 0}>
      <ul class="reply-list">
        <For each={kids()}>
          {(c) => (
            <li class="reply">
              <CommentView comment={c} />
              <ReplyTools
                comment={c}
                topicId={props.topicId}
                composer={props.composer}
                setComposer={props.setComposer}
                onSubmit={props.onSubmit}
              />
              <Replies {...props} parent={c} depth={props.depth + 1} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function ReplyTools(props: {
  comment: Comment;
  topicId: string;
  composer: ComposerState;
  setComposer: (s: ComposerState) => void;
  onSubmit: TreeProps["onSubmit"];
}) {
  const open = () =>
    props.composer?.mode === "reply" && props.composer.parentId === props.comment.id;
  return (
    <>
      <div class="comment-actions">
        <button
          type="button"
          class="link-btn"
          onClick={() =>
            props.setComposer(
              open()
                ? null
                : { mode: "reply", parentId: props.comment.id, topicId: props.topicId },
            )
          }
        >
          Reply
        </button>
      </div>
      <Show when={open()}>
        <Composer
          submitLabel="Post reply"
          placeholder="Write a reply…"
          onSubmit={(text, token) =>
            props.onSubmit(text, token, props.comment.id, props.topicId)
          }
          onCancel={() => props.setComposer(null)}
        />
      </Show>
    </>
  );
}

function CommentView(props: { comment: Comment; root?: boolean }) {
  const c = () => props.comment;
  return (
    <div class={`comment${props.root ? " comment-root" : ""}`}>
      <div class="comment-meta">
        <Show when={c().avatarUrl}>
          <img class="comment-avatar" src={c().avatarUrl ?? ""} alt="" />
        </Show>
        <span class="comment-author" classList={{ anon: c().isAnon }}>
          {c().author}
        </span>
        <a class="comment-date" href={c().url} target="_blank" rel="noreferrer">
          {timeAgo(c().createdAt)}
        </a>
      </div>
      <div class="comment-body" innerHTML={c().bodyHtml} />
    </div>
  );
}

function Composer(props: {
  submitLabel: string;
  placeholder?: string;
  withTitle?: boolean;
  onSubmit: (text: string, token: string | undefined, title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = createSignal("");
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [token, setToken] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  let widgetId: string | undefined;

  function mountWidget(el: HTMLDivElement) {
    if (!config.turnstileSiteKey) return;
    renderTurnstile(el, config.turnstileSiteKey, setToken)
      .then((id) => {
        widgetId = id;
      })
      .catch((e) => setError(errMessage(e)));
  }

  async function submit() {
    if (props.withTitle && !title().trim()) {
      setError("Give the topic a title.");
      return;
    }
    if (!draft().trim()) return;
    if (config.turnstileSiteKey && !token()) {
      setError("Please complete the bot check.");
      return;
    }
    setBusy(true);
    setError();
    try {
      await props.onSubmit(draft(), token(), title().trim());
    } catch (e) {
      setError(errMessage(e));
      resetTurnstile(widgetId);
      setToken(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="composer">
      <Show when={props.withTitle}>
        <input
          class="input"
          placeholder="Topic title"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </Show>
      <textarea
        class="comment-input"
        rows={3}
        placeholder={props.placeholder ?? "Add to the discussion…"}
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
      />
      <Show when={config.turnstileSiteKey}>
        <div class="editor-widget" ref={mountWidget} />
      </Show>
      <div class="editor-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={busy()}
          onClick={submit}
        >
          {busy() ? "Posting…" : props.submitLabel}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
      <Show when={error()}>
        <p class="editor-err">{error()}</p>
      </Show>
    </div>
  );
}

function TopicSkeleton() {
  return (
    <ul class="topic-list" aria-hidden="true">
      <For each={[0, 1, 2]}>
        {() => (
          <li class="topic">
            <div class="topic-summary">
              <span class="sk-bar skeleton" style={{ width: "40%", height: "1rem" }} />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

function CommentSkeleton() {
  return (
    <div aria-hidden="true">
      <span class="sk-bar skeleton" style={{ width: "8rem", height: "0.85rem" }} />
      <div
        class="sk-bar skeleton"
        style={{ width: "70%", height: "0.9rem", "margin-top": "0.5rem" }}
      />
    </div>
  );
}

function participantsOf(thread: Thread): number {
  return new Set([thread.root.author, ...thread.comments.map((c) => c.author)]).size;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [sec, label] of units)
    if (s >= sec) return `${Math.floor(s / sec)}${label} ago`;
  return "just now";
}
