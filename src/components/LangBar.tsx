import { createResource, For } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { languageName } from "../lib/languages";
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

// Existing translations of this article — switch links. Configured languages
// come first (in their listed order), any other language the article exists in
// follows; names resolve through ISO 639-1 so every code shows a real label.
function existing(siblings: string[], current: string): Entry[] {
  const order = config.languages.map((l) => l.code);
  const rank = (c: string) => order.indexOf(c) + 1 || order.length + 1;
  return siblings
    .map((slug) => {
      const lang = langOf(slug);
      return {
        lang,
        name: languageName(lang),
        href: readHref(slug),
        current: slug === current,
      };
    })
    .sort((a, b) => rank(a.lang) - rank(b.lang));
}

// Languages already present elsewhere in the wiki but not yet for this article:
// the likely-to-be-extended set, offered as inline "add" links (W5). Drawn from
// the wiki's actual languages, configured order first.
function extend(siblings: string[], present: Set<string>, key: string): Entry[] {
  const order = config.languages.map((l) => l.code);
  const rank = (c: string) => order.indexOf(c) + 1 || order.length + 1;
  const have = new Set(siblings.map(langOf));
  return [...present]
    .filter((c) => !have.has(c))
    .map((code) => ({
      lang: code,
      name: languageName(code),
      href: createHref(code, key),
      current: false,
    }))
    .sort((a, b) => rank(a.lang) - rank(b.lang));
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
  // The generic "new language" path is always open: the picker on /new offers
  // every ISO 639-1 language, so there's always another one to translate into.
  // It's left unnamed here on purpose (W5: don't pre-suggest a specific language).
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
        <li class="langbar-new">
          <a href={newLangHref}>Translate this page into another language…</a>
        </li>
      </ul>
    </details>
  );
}
