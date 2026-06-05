import { createResource, For } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getHistory } from "../lib/history";

function prettify(slug: string): string {
  const s = slug.split("/").pop() ?? slug;
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function Infobox(props: { slug: string }) {
  const [hist] = createResource(() => (isServer ? undefined : props.slug), getHistory);
  const last = () => hist()?.[0];
  const source = `${config.contentDir}/${props.slug}.md`;
  const sourceUrl = `https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${source}`;

  const rows = () => [
    { k: "Type", v: "Wiki page" },
    { k: "Rendering", v: "Client-side · CDN" },
    { k: "Editing", v: "Anonymous · PR-reviewed" },
    { k: "Revisions", v: hist() ? String(hist()?.length) : "…" },
    {
      k: "Last edit",
      v: last() ? new Date(last()?.date ?? "").toLocaleDateString() : "…",
    },
    { k: "Source", v: `${props.slug}.md`, mono: true, link: sourceUrl },
    { k: "License", v: "CC BY-SA 4.0" },
  ];

  return (
    <aside class="infobox" aria-label="Quick facts">
      <div class="infobox-cap">
        <div class="ib-kicker">Wiki page</div>
        <div class="ib-title">{prettify(props.slug)}</div>
      </div>
      <dl>
        <For each={rows()}>
          {(r) => (
            <div class="ib-row">
              <dt>{r.k}</dt>
              <dd>
                {r.link ? (
                  <a
                    class={r.mono ? "mono" : ""}
                    href={r.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.v}
                  </a>
                ) : (
                  <span class={r.mono ? "mono" : ""}>{r.v}</span>
                )}
              </dd>
            </div>
          )}
        </For>
      </dl>
      <div class="infobox-foot">Facts derived from the page's git history.</div>
    </aside>
  );
}
