import { createResource, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { getLinkGraph } from "../lib/linkgraph";
import { BASE, langOf, readHref } from "../lib/paths";

interface Entry {
  lang: string;
  name: string;
  href: string;
  current: boolean;
}

function createHref(lang: string, key: string): string {
  const createSlug = lang === config.defaultLang ? key : `${lang}/${key}`;
  return `${BASE}/edit/${createSlug}?translationKey=${encodeURIComponent(key)}`;
}

// Existing translations of this article — switch links, ordered by config.
function existing(siblings: string[], current: string): Entry[] {
  const bySlug = new Map(siblings.map((s) => [langOf(s), s]));
  return config.languages.flatMap((l) => {
    const slug = bySlug.get(l.code);
    if (!slug) return [];
    return [
      { lang: l.code, name: l.name, href: readHref(slug), current: slug === current },
    ];
  });
}

// Languages already present elsewhere in the wiki but not yet for this article:
// the likely-to-be-extended set, offered as inline "add" links (W5).
function extend(siblings: string[], present: Set<string>, key: string): Entry[] {
  const have = new Set(siblings.map(langOf));
  return config.languages
    .filter((l) => present.has(l.code) && !have.has(l.code))
    .map((l) => ({
      lang: l.code,
      name: l.name,
      href: createHref(l.code, key),
      current: false,
    }));
}

// Languages not yet anywhere in the wiki: the distinct "translate to a new
// language" path, kept out of the main switch list (W5).
function fresh(present: Set<string>, key: string): Entry[] {
  return config.languages
    .filter((l) => !present.has(l.code))
    .map((l) => ({
      lang: l.code,
      name: l.name,
      href: createHref(l.code, key),
      current: false,
    }));
}

export default function LangBar(props: {
  slug: string;
  translationKey: string;
  initialSiblings: string[];
  wikiLangs: string[];
}) {
  // The Worker index reflects pages + translations created since the last build
  // (no rebuild); merge them in on the client, SSR uses the build-time seeds.
  const [graph] = createResource(
    () => (isServer ? undefined : true),
    () => getLinkGraph(),
  );
  const siblings = () =>
    graph()?.translations?.[props.translationKey] ?? props.initialSiblings;
  const present = () => {
    const g = graph();
    return g ? new Set(Object.keys(g.titles).map(langOf)) : new Set(props.wikiLangs);
  };

  const switches = () => existing(siblings(), props.slug);
  const extras = () => extend(siblings(), present(), props.translationKey);
  // Only offer the generic "new language" path when a configured language isn't
  // yet anywhere in the wiki — but never name it (W5: don't pre-suggest Deutsch).
  const canAddLang = () => fresh(present(), props.translationKey).length > 0;
  const newLangHref = `${BASE}/new?translationKey=${encodeURIComponent(props.translationKey)}`;
  const count = () => switches().length;

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
        <For each={switches()}>
          {(i) => (
            <li>
              <a
                href={i.href}
                lang={i.lang}
                aria-current={i.current ? "page" : undefined}
              >
                {i.name}
              </a>
            </li>
          )}
        </For>
        <For each={extras()}>
          {(i) => (
            <li>
              <a href={i.href} lang={i.lang} class="is-missing">
                {i.name}
                <span class="langbar-add">add</span>
              </a>
            </li>
          )}
        </For>
        <Show when={canAddLang()}>
          <li class="langbar-new">
            <a href={newLangHref}>Translate this page into another language…</a>
          </li>
        </Show>
      </ul>
    </details>
  );
}
