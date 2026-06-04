import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

interface Item {
  id: string;
  text: string;
  level: number;
}

export default function Toc() {
  const [items, setItems] = createSignal<Item[]>([]);
  const [active, setActive] = createSignal<string>();
  let observer: IntersectionObserver | undefined;

  function build() {
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>(".wiki-content :is(h2, h3)[id]"),
    );
    setItems(
      heads.map((h) => ({
        id: h.id,
        text: (h.textContent ?? "").replace(/#\s*$/, "").trim(),
        level: h.tagName === "H2" ? 2 : 3,
      })),
    );
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setActive((e.target as HTMLElement).id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const h of heads) observer.observe(h);
  }

  onMount(() => {
    document.addEventListener("wiki:rendered", build);
    build();
  });
  onCleanup(() => {
    document.removeEventListener("wiki:rendered", build);
    observer?.disconnect();
  });

  return (
    <Show when={items().length > 0}>
      <nav class="toc" aria-label="Contents">
        <p class="toc-title">Contents</p>
        <ul>
          <For each={items()}>
            {(it) => (
              <li
                classList={{ [`toc-l${it.level}`]: true, active: active() === it.id }}
              >
                <a href={`#${it.id}`}>{it.text}</a>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </Show>
  );
}
