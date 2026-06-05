import { createResource, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { getHistory, type Revision } from "../lib/history";

export default function PageMeta(props: {
  slug: string;
  base: string;
  initial?: Revision[];
}) {
  const [hist] = createResource(() => (isServer ? undefined : props.slug), getHistory, {
    initialValue: props.initial,
  });
  const last = () => hist()?.[0];
  const historyHref = `${props.base}/history/${props.slug}`;

  return (
    <div class="page-meta">
      <Show
        when={hist()}
        fallback={<span class="meta-skeleton skeleton" aria-hidden="true" />}
      >
        <Show when={last()} fallback={<span>Not yet saved</span>}>
          <span>Last edited by</span>
          <a class="pseudonym" href={historyHref}>
            {last()?.author}
          </a>
          <span class="dot">·</span>
          <a href={historyHref}>{new Date(last()?.date ?? "").toLocaleDateString()}</a>
          <span class="dot">·</span>
          <a href={historyHref}>{hist()?.length} revisions</a>
        </Show>
      </Show>
    </div>
  );
}
