import { For, Show } from "solid-js";
import type { Comment } from "../../lib/comments";
import { CommentView } from "./CommentView";
import { Composer } from "./Composer";
import type { TreeProps } from "./types";

function childrenOf(parent: Comment, isRoot: boolean, all: Comment[]): Comment[] {
  const known = new Set(all.map((c) => c.id));
  return all.filter((c) =>
    isRoot
      ? !c.replyTo || c.replyTo === parent.id || !known.has(c.replyTo)
      : c.replyTo === parent.id,
  );
}

export function Replies(props: TreeProps & { parent: Comment; depth: number }) {
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

export function ReplyTools(props: {
  comment: Comment;
  topicId: string;
  composer: TreeProps["composer"];
  setComposer: TreeProps["setComposer"];
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
