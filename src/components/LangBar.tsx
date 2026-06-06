import { createResource, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getLinkGraph } from "../lib/linkgraph";
import { BASE, langOf, readHref } from "../lib/paths";

interface Entry {
  lang: string;
  name: string;
  href: string;
  exists: boolean;
  current: boolean;
}

// One entry per configured language: existing translations link to the page;
// missing ones get a "create" link seeded with the shared key, so the new page
// joins the group on save ("translate this page").
function entries(siblings: string[], current: string, key: string): Entry[] {
  const bySlug = new Map(siblings.map((s) => [langOf(s), s]));
  return config.languages.map((l) => {
    const slug = bySlug.get(l.code);
    const createSlug = l.code === config.defaultLang ? key : `${l.code}/${key}`;
    return {
      lang: l.code,
      name: l.name,
      href: slug
        ? readHref(slug)
        : `${BASE}/edit/${createSlug}?translationKey=${encodeURIComponent(key)}`,
      exists: Boolean(slug),
      current: slug === current,
    };
  });
}

export default function LangBar(props: {
  slug: string;
  translationKey: string;
  initialSiblings: string[];
}) {
  // The Worker index reflects translations created since the last build (no
  // rebuild), so merge them in on the client; SSR uses the build-time siblings.
  const [live] = createResource(
    () => !isServer,
    async () => (await getLinkGraph())?.translations?.[props.translationKey],
  );
  const siblings = () => live() ?? props.initialSiblings;
  const items = () => entries(siblings(), props.slug, props.translationKey);
  const count = () => items().filter((i) => i.exists).length;

  return (
    <details class="langbar">
      <summary class="langbar-toggle">
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M2.5 10h15M10 2.5c2.5 2.4 2.5 12.6 0 15M10 2.5c-2.5 2.4-2.5 12.6 0 15" />
        </svg>
        <span>
          {count()} {count() === 1 ? "language" : "languages"}
        </span>
      </summary>
      <ul class="langbar-menu">
        <For each={items()}>
          {(i) => (
            <li>
              <a
                href={i.href}
                lang={i.lang}
                classList={{ "is-missing": !i.exists }}
                aria-current={i.current ? "page" : undefined}
              >
                {i.name}
                <Show when={!i.exists}>
                  <span class="langbar-add">add</span>
                </Show>
              </a>
            </li>
          )}
        </For>
      </ul>
    </details>
  );
}
