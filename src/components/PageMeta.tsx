import { createResource, Show } from "solid-js";
import { getHistory } from "../lib/history";

export default function PageMeta(props: { slug: string; base: string }) {
  const [hist] = createResource(() => props.slug, getHistory);
  const last = () => hist()?.[0];
  const historyHref = `${props.base}/history/${props.slug}`;

  return (
    <div class="page-meta">
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
    </div>
  );
}
