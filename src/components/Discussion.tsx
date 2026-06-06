import { createSignal, For, Show } from "solid-js";
import { config } from "../config";
import type { Thread } from "../lib/comments";
import { timeAgo } from "../lib/format";
import { slugFromLocation } from "../lib/paths";
import { createThreadStore } from "../lib/thread-store";
import { CommentView } from "./discussion/CommentView";
import { Composer } from "./discussion/Composer";
import { Replies, ReplyTools } from "./discussion/Replies";
import { CommentSkeleton, TopicSkeleton } from "./discussion/skeletons";
import type { ComposerState } from "./discussion/types";
import { Icons } from "./Icons";
import { Status } from "./ui";

export default function Discussion(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const store = createThreadStore(slug);

  const [composer, setComposer] = createSignal<ComposerState>(null);

  function toggle(id: string) {
    setComposer(null);
    store.toggle(id);
  }

  async function submitTopic(text: string, token: string | undefined, title: string) {
    await store.submitTopic(text, token, title);
    setComposer(null);
  }

  async function submitReply(
    text: string,
    token: string | undefined,
    parentId: string,
    topicId: string,
  ) {
    await store.submitReply(text, token, parentId, topicId);
    setComposer(null);
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

      <Show when={store.topicsLoaded()} fallback={<TopicSkeleton />}>
        <Show
          when={store.list.length > 0}
          fallback={<Status>No topics yet — start the discussion.</Status>}
        >
          <ul class="topic-list">
            <For each={store.list}>
              {(t) => (
                <li class="topic">
                  <button
                    type="button"
                    class="topic-summary"
                    aria-expanded={store.openId() === t.id}
                    onClick={() => toggle(t.id)}
                  >
                    <Icons.Chevron
                      class="topic-caret"
                      style={{
                        transform:
                          store.openId() === t.id ? "rotate(0)" : "rotate(-90deg)",
                      }}
                    />
                    <span class="topic-title">{t.title}</span>
                    <span class="topic-meta">
                      {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"} ·{" "}
                      {timeAgo(t.lastAt)}
                    </span>
                  </button>

                  <Show when={store.openId() === t.id}>
                    <div class="thread">
                      <Show when={store.thread()} fallback={<CommentSkeleton />}>
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

function participantsOf(thread: Thread): number {
  return new Set([thread.root.author, ...thread.comments.map((c) => c.author)]).size;
}
