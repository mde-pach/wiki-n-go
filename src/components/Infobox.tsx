import { createSignal, For, onMount, Show } from "solid-js";
import { fetchMarkdown } from "../lib/content";
import { normalizeRow, type PageMeta, parseFrontmatter } from "../lib/frontmatter";
import { prettify } from "../lib/paths";

interface Row {
  k: string;
  v: string;
  mono?: boolean;
  link?: string;
}

export default function Infobox(props: { slug: string; meta?: PageMeta }) {
  const [meta, setMeta] = createSignal<PageMeta>(props.meta ?? {});

  // Re-read frontmatter from the CDN so infobox edits show without a rebuild.
  onMount(async () => {
    try {
      const { meta: fresh } = parseFrontmatter(await fetchMarkdown(props.slug));
      setMeta(fresh);
    } catch {
      // keep the build-time meta
    }
  });

  const custom = () => meta().infobox;
  const rows = (): Row[] => {
    const ib = custom();
    return ib
      ? Object.entries(ib).map(([k, val]) => ({ k, ...normalizeRow(val) }))
      : [];
  };
  const isImageUrl = (s: string) =>
    /^(https?:|\/)|\.(png|jpe?g|gif|svg|webp)$/i.test(s);

  return (
    <Show when={rows().length > 0}>
      <aside class="infobox" aria-label="Quick facts">
        <div class="infobox-cap">
          <div class="ib-kicker">{meta().kicker ?? "Wiki page"}</div>
          <div class="ib-title">{prettify(props.slug)}</div>
        </div>
        <Show when={meta().image}>
          {(img) => (
            <div class="infobox-fig">
              <Show
                when={isImageUrl(img())}
                fallback={
                  <div class="img-placeholder" style={{ height: "130px" }}>
                    <span>{img()}</span>
                  </div>
                }
              >
                <img src={img()} alt="" />
              </Show>
            </div>
          )}
        </Show>
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
        <div class="infobox-foot">
          Frontmatter-driven · stored as YAML in the page's source.
        </div>
      </aside>
    </Show>
  );
}
