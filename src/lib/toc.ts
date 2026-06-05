import { createSignal, onCleanup, onMount } from "solid-js";
import type { Heading } from "./markdown";

export type { Heading };

// Shared scroll-spy + reading-progress for the desktop and mobile TOCs. Both
// render from the SSR'd outline, then re-derive from the live DOM once the
// article hydrates (the `wiki:rendered` event).
export function createHeadings(initial: Heading[] = []) {
  const [items, setItems] = createSignal<Heading[]>(initial);
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

  return { items, active, progress };
}
