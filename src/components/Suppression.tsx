import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import {
  listSuppressed,
  type Suppression as S,
  suppress,
  unsuppress,
} from "../lib/admin";
import { timeAgo } from "../lib/format";
import { useFormAction } from "../lib/solid";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function Suppression() {
  const [list, { refetch }] = createResource(
    () => (isServer ? undefined : true),
    listSuppressed,
  );
  const [type, setType] = createSignal<"author" | "revision">("author");
  const [value, setValue] = createSignal("");
  const [reason, setReason] = createSignal("");
  const { busy, error, run } = useFormAction();

  async function add(e: Event) {
    e.preventDefault();
    const v = value().trim();
    if (!v) return;
    await run(async () => {
      await suppress(type(), v, reason().trim() || undefined);
      setValue("");
      setReason("");
      refetch();
    });
  }

  async function remove(s: S) {
    await run(async () => {
      await unsuppress(s.type, s.value);
      refetch();
    });
  }

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Suppression"
        sub="Hide a pseudonym or a single revision from Recent changes + History (redacted server-side). Full hard-purge — rewriting git history — stays a manual owner operation."
      />

      <form class="ban-form" onSubmit={add}>
        <select
          class="ban-input"
          value={type()}
          onChange={(e) => setType(e.currentTarget.value as "author" | "revision")}
        >
          <option value="author">author</option>
          <option value="revision">revision</option>
        </select>
        <input
          class="ban-input"
          aria-label={
            type() === "author" ? "Author to suppress" : "Revision sha to suppress"
          }
          placeholder={type() === "author" ? "anon-… or login" : "commit sha"}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <input
          class="ban-input"
          aria-label="Reason (optional)"
          placeholder="reason — optional"
          value={reason()}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={busy() || !value().trim()}
        >
          Suppress
        </button>
      </form>

      <ErrorNote msg={error()} />

      <Show when={list()} fallback={<Status>Loading suppressions…</Status>}>
        <Show
          when={(list()?.length ?? 0) > 0}
          fallback={<Status>Nothing suppressed.</Status>}
        >
          <ul class="ban-list">
            <For each={list()}>
              {(s) => (
                <li class="ban-row">
                  <span class="ban-scope partial">{s.type}</span>
                  <span class="ban-key">{s.value}</span>
                  <span class="ban-reason">{s.reason}</span>
                  <span class="ban-meta">
                    {s.by}
                    {s.at ? ` · ${timeAgo(s.at)}` : ""}
                  </span>
                  <button
                    type="button"
                    class="link-btn ban-unblock"
                    onClick={() => remove(s)}
                  >
                    unsuppress
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
