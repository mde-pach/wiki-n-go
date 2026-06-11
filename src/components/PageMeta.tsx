import { createResource, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { getHistory, type Revision } from "../lib/history";
import { viewHref } from "../lib/paths";

export default function PageMeta(props: { slug: string; initial?: Revision[] }) {
  const [hist] = createResource(() => (isServer ? undefined : props.slug), getHistory, {
    initialValue: props.initial,
  });
  const last = () => hist()?.[0];
  // Collapse the home → /history (not /history/index, which Pages 308-strips) — W4.
  const historyHref = viewHref("history", props.slug);
  // Format from the ISO date's own Y-M-D parts (the author's calendar day), not
  // via toLocaleDateString — that's locale-dependent, so the build (en-US) and
  // the reader's browser (e.g. fr) render different strings and the date visibly
  // flips on hydration. A pure string slice is identical on server and client.
  const editedOn = (iso?: string) => {
    const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };

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
          <a href={historyHref}>{editedOn(last()?.date)}</a>
          <span class="dot">·</span>
          <a href={historyHref}>{hist()?.length} revisions</a>
        </Show>
      </Show>
    </div>
  );
}
