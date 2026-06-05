import { Show } from "solid-js";
import Discussion from "./Discussion";
import Editor from "./Editor";
import History from "./History";
import WikiPage from "./WikiPage";

type View = "read" | "edit" | "history" | "talk";

function parse(): { view: View; slug: string } {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = window.location.pathname;
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  for (const v of ["edit", "history", "talk"] as const) {
    if (path === v || path.startsWith(`${v}/`)) {
      return { view: v, slug: path.slice(v.length).replace(/^\/+/, "") || "index" };
    }
  }
  return { view: "read", slug: path || "index" };
}

export default function Route404() {
  const { view, slug } = parse();
  return (
    <main id="main" class="view-wrap">
      <Show when={view === "read"}>
        <article class="prose">
          <WikiPage slug={slug} />
        </article>
      </Show>
      <Show when={view === "edit"}>
        <Editor slug={slug} open />
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
