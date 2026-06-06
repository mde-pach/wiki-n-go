import { Show } from "solid-js";
import type { Comment } from "../../lib/comments";
import { timeAgo } from "../../lib/format";

export function CommentView(props: { comment: Comment; root?: boolean }) {
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
