import { For, type JSX, Show } from "solid-js";
import { config } from "../config";
import { repoSlug } from "../lib/engine";
import { buildChecklist, fetchFirstRunState } from "../lib/first-run";
import {
  appInstallUrl,
  type EngineStatus,
  fetchEngineStatus,
  repoUrl,
  usingHostedBackend,
} from "../lib/setup-status";
import { clientResource } from "../lib/solid";
import { ViewHead } from "./ui";

type State = "ok" | "warn" | "error" | "info";
interface Item {
  state: State;
  title: string;
  detail: JSX.Element;
  action?: { label: string; href: string };
}

const ICON: Record<State, string> = { ok: "✓", warn: "!", error: "✕", info: "i" };

// Turn the Engine's self-report into a friendly, non-technical checklist. Each
// line is one thing a wiki owner cares about, with a one-click fix where relevant.
function buildItems(status: EngineStatus | null): Item[] {
  const repo = repoSlug();
  const items: Item[] = [];

  // 1. Backend reachability.
  if (!status) {
    items.push({
      state: "error",
      title: "Backend not reachable",
      detail: (
        <>
          Couldn't reach the editing service at <code>{config.workerUrl}</code>. Reading
          still works, but editing and sign-in are unavailable until it's back. If you
          self-host it, check it's running; otherwise it may be a temporary outage.
        </>
      ),
    });
    return items;
  }

  items.push({
    state: "ok",
    title: "Backend connected",
    detail: (
      <>
        {usingHostedBackend()
          ? "You're using the hosted wikigit.org service — nothing to run yourself."
          : "Connected to your own self-hosted service."}{" "}
        <code>{config.workerUrl}</code>
      </>
    ),
  });

  // 2. Is THIS wiki connected? (only meaningful on the shared multi-tenant Engine)
  if (status.mode === "multi") {
    const install = appInstallUrl(status.appSlug);
    items.push(
      status.served
        ? {
            state: "ok",
            title: "This wiki is connected",
            detail: (
              <>
                The Wikigit app is installed on <code>{repo}</code>, so edits can be
                saved to it.
              </>
            ),
          }
        : {
            state: "warn",
            title: "Connect this wiki",
            detail: (
              <>
                Install the Wikigit app on <code>{repo}</code> so it can save edits. One
                click — you choose the repository on GitHub.
              </>
            ),
            action: install ? { label: "Connect on GitHub", href: install } : undefined,
          },
    );
  }

  // 3. Editing (anonymous always available).
  items.push({
    state: "ok",
    title: "Anyone can edit",
    detail:
      "Visitors can edit without an account — changes are saved to your repo as " +
      "anonymous, rate-limited, bot-checked contributions.",
  });

  // 4. Sign-in (optional, attribution).
  const providers = Object.entries(status.signin.providers)
    .filter(([, on]) => on)
    .map(([p]) => (p === "github" ? "GitHub" : "Wikigit"));
  items.push(
    providers.length > 0
      ? {
          state: "ok",
          title: "Sign-in available",
          detail: `People can sign in with ${providers.join(" or ")} to attribute their edits.`,
        }
      : {
          state: "info",
          title: "Anonymous-only",
          detail:
            "Sign-in isn't configured, so all edits are anonymous. That's fine — " +
            "the operator can enable GitHub or Wikigit sign-in later.",
        },
  );

  // 5. Write credential — only surface when it's a problem (self-host concern).
  if (status.writeCredential === "none") {
    items.push({
      state: "error",
      title: "No write credential",
      detail:
        "The backend has no GitHub credential, so edits can't be saved. Set a " +
        "GitHub App key (recommended) or a token on the backend.",
    });
  }

  // 6. Content & hosting.
  items.push({
    state: "info",
    title: "Your content & hosting",
    detail: (
      <>
        This wiki reads from <code>{repo}</code> and renders without rebuilds. Pages are
        plain Markdown files you own.
      </>
    ),
    action: { label: "View on GitHub", href: repoUrl() },
  });

  return items;
}

export default function Setup() {
  const status = clientResource(fetchEngineStatus);
  const firstRun = clientResource(fetchFirstRunState);

  return (
    <main id="main" class="view-wrap setup-page">
      <ViewHead
        title="Setup & status"
        sub="Your wiki at a glance. Green is ready; anything flagged has a one-click fix."
      />

      <Show
        when={!status.loading}
        fallback={<p class="wiki-status">Checking your wiki…</p>}
      >
        <ul class="setup-list">
          <For each={buildItems(status() ?? null)}>
            {(item) => (
              <li class={`setup-item is-${item.state}`}>
                <span class="setup-icon" aria-hidden="true">
                  {ICON[item.state]}
                </span>
                <div class="setup-body">
                  <p class="setup-item-title">{item.title}</p>
                  <p class="setup-item-detail">{item.detail}</p>
                </div>
                <Show when={item.action}>
                  {(a) => (
                    <a
                      class="btn btn-primary btn-sm setup-action"
                      href={a().href}
                      target={a().href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                    >
                      {a().label}
                    </a>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={!firstRun.loading && status()}>
        <section class="setup-firstrun">
          <h3>Getting started</h3>
          <p class="setup-firstrun-sub">
            A few first steps — each ticks off on its own as you go.
          </p>
          <ul class="setup-list">
            <For
              each={buildChecklist(
                firstRun() ?? { pages: 0, maintainers: 0, signinAvailable: false },
              )}
            >
              {(item) => (
                <li class={`setup-item is-${item.done ? "ok" : "info"}`}>
                  <span class="setup-icon" aria-hidden="true">
                    {item.done ? "✓" : "○"}
                  </span>
                  <div class="setup-body">
                    <p class="setup-item-title">{item.title}</p>
                    <p class="setup-item-detail">{item.detail}</p>
                  </div>
                  <Show when={item.action}>
                    {(a) => (
                      <a class="btn btn-primary btn-sm setup-action" href={a().href}>
                        {a().label}
                      </a>
                    )}
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <section class="setup-paths">
        <h3>Two ways to run a Wikigit</h3>
        <p>
          <strong>Hosted</strong> — keep your content in a GitHub repo and let{" "}
          <code>wikigit.org</code> run the editing service for you. No server. Connect
          your repo above and you're done.
        </p>
        <p>
          <strong>Self-hosted</strong> — run the engine yourself (a single Bun process,
          no database) and point this site at it. Same features, fully your own. See{" "}
          <code>worker/DEPLOY.md</code>.
        </p>
      </section>
    </main>
  );
}
