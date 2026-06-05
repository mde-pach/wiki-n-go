import { For, Show } from "solid-js";
import { createHeadings, type Heading } from "../lib/toc";
import { Icons } from "./Icons";

export default function Toc(props: { editHref?: string; initialItems?: Heading[] }) {
  const { items, active, progress } = createHeadings(props.initialItems ?? []);

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
              <Icons.Edit />
              Edit this page
            </a>
          </Show>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            style={{ "justify-content": "flex-start" }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <Icons.Chevron style={{ transform: "rotate(180deg)" }} />
            Back to top
          </button>
        </div>
      </nav>
    </Show>
  );
}
