import { Match, Show, Switch } from "solid-js";
import { parseRoute } from "../lib/paths";
import CategoryList from "./CategoryList";
import Discussion from "./Discussion";
import Editor from "./Editor";
import History from "./History";
import RecentChanges from "./RecentChanges";
import ReviewQueue from "./ReviewQueue";
import WikiPage from "./WikiPage";

export default function Route404() {
  const { view, slug } = parseRoute();
  return (
    <Switch
      fallback={
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
      }
    >
      <Match when={view === "category"}>
        <CategoryList cat={slug} />
      </Match>
      <Match when={view === "changes"}>
        <RecentChanges />
      </Match>
      <Match when={view === "review"}>
        <ReviewQueue />
      </Match>
    </Switch>
  );
}
