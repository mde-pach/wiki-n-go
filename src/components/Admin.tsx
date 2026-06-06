import { createSignal, For, Match, Show, Switch } from "solid-js";
import { config } from "../config";
import { useWhoami } from "../lib/solid";
import AuditLog from "./AuditLog";
import Bans from "./Bans";
import RecentChanges from "./RecentChanges";
import ReviewQueue from "./ReviewQueue";
import { Status, ViewHead } from "./ui";

type Panel = "changes" | "review" | "bans" | "audit";
const PANELS: { id: Panel; label: string }[] = [
  { id: "changes", label: "Recent changes" },
  { id: "review", label: "Pending review" },
  { id: "bans", label: "Blocks" },
  { id: "audit", label: "Audit log" },
];

export default function Admin() {
  if (!config.workerUrl) return null;

  const { who, isMaintainer } = useWhoami();
  const [panel, setPanel] = createSignal<Panel>("changes");

  return (
    <Show
      when={who()}
      fallback={
        <main id="main" class="view-wrap">
          <Status>Checking access…</Status>
        </main>
      }
    >
      <Show
        when={isMaintainer()}
        fallback={
          <main id="main" class="view-wrap">
            <ViewHead
              title="Admin console"
              sub="The sysop console — recent changes, the review queue and rollback."
            />
            <Status>This console is restricted to maintainers.</Status>
          </main>
        }
      >
        <nav class="special-tabs admin-tabs" aria-label="Admin sections">
          <For each={PANELS}>
            {(p) => (
              <button
                type="button"
                class={`sp-tab${panel() === p.id ? " is-active" : ""}`}
                aria-pressed={panel() === p.id}
                onClick={() => setPanel(p.id)}
              >
                {p.label}
              </button>
            )}
          </For>
        </nav>
        <Switch>
          <Match when={panel() === "changes"}>
            <RecentChanges admin />
          </Match>
          <Match when={panel() === "review"}>
            <ReviewQueue />
          </Match>
          <Match when={panel() === "bans"}>
            <Bans />
          </Match>
          <Match when={panel() === "audit"}>
            <AuditLog />
          </Match>
        </Switch>
      </Show>
    </Show>
  );
}
