import { For } from "solid-js";

export function TopicSkeleton() {
  return (
    <ul class="topic-list" aria-hidden="true">
      <For each={[0, 1, 2]}>
        {() => (
          <li class="topic">
            <div class="topic-summary">
              <span class="sk-bar skeleton" style={{ width: "40%", height: "1rem" }} />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

export function CommentSkeleton() {
  return (
    <div aria-hidden="true">
      <span class="sk-bar skeleton" style={{ width: "8rem", height: "0.85rem" }} />
      <div
        class="sk-bar skeleton"
        style={{ width: "70%", height: "0.9rem", "margin-top": "0.5rem" }}
      />
    </div>
  );
}
