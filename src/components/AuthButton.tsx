import { createSignal, For, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  authProviders,
  authProvidersCached,
  getSession,
  login,
  logout,
  type Providers,
} from "../lib/auth";
import { Icons } from "./Icons";

type Provider = "github" | "wikigit";

const PROVIDER_LABEL: Record<Provider, string> = {
  github: "Continue with GitHub",
  wikigit: "Continue with Wikigit",
};

function ProviderMark(props: { provider: Provider }) {
  return (
    <Show
      when={props.provider === "github"}
      fallback={
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M2.5 10h15M10 2.5c2.5 2.4 2.5 12.6 0 15M10 2.5c-2.5 2.4-2.5 12.6 0 15" />
        </svg>
      }
    >
      <Icons.Github />
    </Show>
  );
}

export default function AuthButton() {
  // Resolve from synchronous state at hydration so the chrome doesn't blink in
  // after a Worker round-trip: a stored session means signed-in immediately. The
  // sign-in button shows from first paint regardless — it only hides if the
  // Worker positively reports auth disabled (revalidated in the background below),
  // so turning a provider on needs only a Worker deploy — no rebuild, no flag.
  const [session] = createSignal(getSession());
  const [providers, setProviders] = createSignal<Providers | undefined>(
    authProvidersCached(),
  );
  const [open, setOpen] = createSignal(false);
  onMount(async () => setProviders(await authProviders()));

  // Unknown providers (first-ever visit) still render the button and offer both
  // options; the Worker is the authority and rejects any it hasn't enabled.
  const knownDisabled = () => {
    const p = providers();
    return p ? !p.github && !p.wikigit : false;
  };
  const choices = (): Provider[] => {
    const p = providers();
    if (!p) return ["github", "wikigit"];
    return (["github", "wikigit"] as Provider[]).filter((k) => p[k]);
  };

  return (
    <Show when={session() || !knownDisabled()}>
      <Show
        when={session()}
        fallback={
          <>
            <button
              type="button"
              class="btn btn-outline btn-sm signin"
              onClick={() => setOpen(true)}
            >
              Sign in
            </button>
            <Show when={open()}>
              <Portal>
                <div class="overlay">
                  <button
                    type="button"
                    class="signin-scrim"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                  />
                  <div
                    class="modal signin-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Sign in"
                  >
                    <div class="modal-head">
                      <div>
                        <p class="mh-title">Sign in</p>
                        <p class="mh-sub">Choose how you'd like to continue.</p>
                      </div>
                      <button
                        type="button"
                        class="btn btn-icon btn-ghost mh-close"
                        aria-label="Close"
                        onClick={() => setOpen(false)}
                      >
                        <Icons.Close />
                      </button>
                    </div>
                    <div class="modal-body provider-list">
                      <For each={choices()}>
                        {(p) => (
                          <button
                            type="button"
                            class="btn btn-outline provider-btn"
                            onClick={() => login(p)}
                          >
                            <ProviderMark provider={p} />
                            {PROVIDER_LABEL[p]}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Portal>
            </Show>
          </>
        }
      >
        {(s) => (
          <div class="signin">
            <img class="avatar" src={s().avatar} alt="" width="26" height="26" />
            <span class="signin-label">{s().login}</span>
            <button type="button" class="btn btn-ghost btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </Show>
    </Show>
  );
}
