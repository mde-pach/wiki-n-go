import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { config } from "../config";
import { pageSet } from "../lib/manifest";

export default function Search() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
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
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));

  const href = (p: string) => `${base}/${p === config.homeSlug ? "" : p}`;

  return (
    <div class={`search${open() ? " is-open" : ""}`} role="search">
      <div class="search-field">
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
              <a class="search-result" href={href(p)} role="option">
                <span class="sr-title">{p}</span>
              </a>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
