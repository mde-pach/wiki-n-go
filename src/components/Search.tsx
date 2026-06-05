import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { pageSet } from "../lib/manifest";
import { readHref } from "../lib/paths";
import { Icons } from "./Icons";

export default function Search() {
  const [q, setQ] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [all, setAll] = createSignal<string[]>([]);
  let field: HTMLInputElement | undefined;

  async function load() {
    if (all().length === 0) setAll([...(await pageSet())].sort());
  }

  const results = () => {
    const s = q().trim().toLowerCase();
    const list = s ? all().filter((p) => p.toLowerCase().includes(s)) : all();
    return list.slice(0, 6);
  };

  function onKey(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      field?.focus();
    }
  }
  onMount(() => {
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
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
          onFocus={() => {
            setOpen(true);
            load();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <span class="search-kbd">/</span>
      </div>
      <Show when={open() && results().length > 0}>
        <div class="search-results" role="listbox">
          <For each={results()}>
            {(p) => (
              <a class="search-result" href={readHref(p)} role="option">
                <span class="sr-title">{p}</span>
              </a>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
