import { createResource, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { type AuditEntry, listAudit } from "../lib/admin";
import { timeAgo } from "../lib/format";
import { Status, ViewHead } from "./ui";

export default function AuditLog() {
  const [entries] = createResource(() => (isServer ? undefined : 50), listAudit);

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Audit log"
        sub="Admin actions that don't surface as ordinary edits — rollbacks and blocks."
      />

      <Show when={entries()} fallback={<Status>Loading the log…</Status>}>
        <Show
          when={(entries()?.length ?? 0) > 0}
          fallback={<Status>No actions logged yet.</Status>}
        >
          <ul class="audit-list">
            <For each={entries()}>
              {(e: AuditEntry) => (
                <li class="audit-row">
                  <span class="audit-time">{timeAgo(e.at)}</span>
                  <span class={`audit-action act-${e.action}`}>{e.action}</span>
                  <span class="audit-target">{e.target}</span>
                  <span class="audit-by">{e.by}</span>
                  <Show when={e.detail}>
                    <span class="audit-detail">{e.detail}</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
