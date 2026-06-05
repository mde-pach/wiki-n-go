import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { BASE, readHref } from "../lib/paths";
import {
  getSearchDocs,
  type SearchDoc,
  search,
  slugifyQuery,
  splitHighlight,
} from "../lib/search";
import { Icons } from "./Icons";

interface Item {
  href: string;
  title: string;
  snippet: string;
  missing: boolean;
  slug: string;
}

export default function Search() {
  const [q, setQ] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [docs, setDocs] = createSignal<SearchDoc[]>([]);
  const [active, setActive] = createSignal(0);
  let field: HTMLInputElement | undefined;

  async function load() {
    if (docs().length === 0) setDocs(await getSearchDocs());
  }

  const items = createMemo<Item[]>(() => {
    const s = q().trim();
    if (!s) return [];
    const hits = search(docs(), s).map((h) => ({
      href: readHref(h.slug),
      title: h.title,
      snippet: h.snippet,
      missing: false,
      slug: h.slug,
    }));
    if (hits.length > 0) return hits;
    const slug = slugifyQuery(s);
    return slug
      ? [{ href: `${BASE}/edit/${slug}`, title: s, snippet: "", missing: true, slug }]
      : [];
  });

  function move(delta: number) {
    const n = items().length;
    if (n > 0) setActive((active() + delta + n) % n);
  }

  function onFieldKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      const it = items()[active()];
      if (it) window.location.href = it.href;
    } else if (e.key === "Escape") {
      field?.blur();
    }
  }

  function onGlobalKey(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      field?.focus();
    }
  }
  onMount(() => {
    window.addEventListener("keydown", onGlobalKey);
    onCleanup(() => window.removeEventListener("keydown", onGlobalKey));
  });

  return (
    <div class={`search${open() ? " is-open" : ""}`} role="search">
      <div class="search-field">
        <Icons.Search />
        <input
          ref={field}
          value={q()}
          placeholder="Search wiki-n-go…"
          aria-label="Search the wiki"
          autocomplete="off"
          onFocus={() => {
            setOpen(true);
            load();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onInput={(e) => {
            setQ(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onFieldKey}
        />
        <span class="search-kbd">/</span>
      </div>
      <Show when={open() && items().length > 0}>
        <div class="search-results" role="listbox">
          <For each={items()}>
            {(it, i) => (
              <a
                class={`search-result${it.missing ? " is-missing" : ""}${
                  active() === i() ? " is-active" : ""
                }`}
                href={it.href}
                role="option"
                aria-selected={active() === i()}
                onMouseEnter={() => setActive(i())}
              >
                <span class="sr-title">
                  <Show
                    when={it.missing}
                    fallback={<Highlight text={it.title} query={q()} />}
                  >
                    Create “{it.title}”<span class="sr-badge"> new</span>
                  </Show>
                </span>
                <Show when={it.snippet}>
                  <span class="sr-snippet">
                    <Highlight text={it.snippet} query={q()} />
                  </span>
                </Show>
              </a>
            )}
          </For>
          <div class="search-foot">
            <span>
              {items()[0]?.missing
                ? "No matches"
                : `${items().length} ${items().length === 1 ? "result" : "results"}`}
            </span>
            <span>↩ to open</span>
          </div>
        </div>
      </Show>
    </div>
  );
}

function Highlight(props: { text: string; query: string }) {
  const segs = createMemo(() => splitHighlight(props.text, props.query));
  return <For each={segs()}>{(s) => (s.hit ? <mark>{s.t}</mark> : s.t)}</For>;
}
