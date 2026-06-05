import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

interface Item {
  id: string;
  text: string;
  level: number;
}

export default function Toc(props: { editHref?: string; initialItems?: Item[] }) {
  const [items, setItems] = createSignal<Item[]>(props.initialItems ?? []);
  const [active, setActive] = createSignal<string>();
  const [progress, setProgress] = createSignal(0);
  let observer: IntersectionObserver | undefined;

  function build() {
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>(".prose :is(h2, h3)[id]"),
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

  function onScroll() {
    const d = document.documentElement;
    const total = d.scrollHeight - d.clientHeight;
    setProgress(
      total > 0 ? Math.min(100, Math.max(0, (d.scrollTop / total) * 100)) : 0,
    );
  }

  onMount(() => {
    document.addEventListener("wiki:rendered", build);
    window.addEventListener("scroll", onScroll, { passive: true });
    build();
    onScroll();
    onCleanup(() => {
      document.removeEventListener("wiki:rendered", build);
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    });
  });

  return (
    <Show when={items().length > 0}>
      <nav class="toc" aria-label="Contents">
        <div class="toc-head">
          <span>Contents</span>
          <span class="mono">{items().length}</span>
        </div>
        <div class="toc-progress" aria-hidden="true">
          <span style={{ width: `${progress()}%` }} />
        </div>
        <ul class="toc-list">
          <For each={items()}>
            {(it) => (
              <li
                class={`toc-item lvl-${it.level}${active() === it.id ? " is-active" : ""}`}
              >
                <a
                  href={`#${it.id}`}
                  aria-current={active() === it.id ? "true" : undefined}
                >
                  {it.text}
                </a>
              </li>
            )}
          </For>
        </ul>
        <div class="toc-tools">
          <Show when={props.editHref}>
            <a
              class="btn btn-ghost btn-sm"
              style={{ "justify-content": "flex-start" }}
              href={props.editHref}
            >
              Edit this page
            </a>
          </Show>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            style={{ "justify-content": "flex-start" }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to top
          </button>
        </div>
      </nav>
    </Show>
  );
}
