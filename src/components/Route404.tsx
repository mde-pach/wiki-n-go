import { Show } from "solid-js";
import { parseRoute } from "../lib/paths";
import Discussion from "./Discussion";
import Editor from "./Editor";
import History from "./History";
import WikiPage from "./WikiPage";

export default function Route404() {
  const { view, slug } = parseRoute();
  return (
    <main id="main" class="view-wrap">
      <Show when={view === "read"}>
        <article class="prose">
          <WikiPage slug={slug} />
        </article>
      </Show>
      <Show when={view === "edit"}>
        <Editor slug={slug} />
      </Show>
      <Show when={view === "history"}>
        <History slug={slug} />
      </Show>
      <Show when={view === "talk"}>
        <Discussion slug={slug} />
      </Show>
    </main>
  );
}
