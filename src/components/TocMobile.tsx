import { For, Show } from "solid-js";
import { createHeadings, type Heading } from "../lib/toc";
import { Icons } from "./Icons";

export default function TocMobile(props: { initialItems?: Heading[] }) {
  const { items, active } = createHeadings(props.initialItems ?? []);

  function closeOn(e: MouseEvent) {
    (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
  }

  return (
    <Show when={items().length > 0}>
      <details class="toc-mobile">
        <summary>
          <Icons.List style={{ width: "16px", height: "16px" }} />
          Contents
          <Icons.Chevron
            class="chev"
            style={{ width: "20px", height: "20px", "stroke-width": "2.1" }}
          />
        </summary>
        <ul class="toc-list">
          <For each={items()}>
            {(it) => (
              <li
                class={`toc-item lvl-${it.level}${active() === it.id ? " is-active" : ""}`}
              >
                <a href={`#${it.id}`} onClick={closeOn}>
                  {it.text}
                </a>
              </li>
            )}
          </For>
        </ul>
      </details>
    </Show>
  );
}
