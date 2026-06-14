import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  authProviders,
  authProvidersCached,
  enabledProviders,
  getSession,
  login,
  logout,
  type Provider,
} from "../lib/auth";
import { dialogBehavior } from "../lib/dialog";
import { Icons } from "./Icons";

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
  // Rendered client-only (no SSR), so the session can be read synchronously and
  // the correct chrome shows from this island's first render — no signed-in→avatar
  // flash. `AuthBoot`'s pre-paint script already painted the same chrome before
  // the bundle loaded; on mount we drop that placeholder and take over interactive.
  const [session] = createSignal(getSession());
  const [providers, setProviders] = createSignal(authProvidersCached());
  const [open, setOpen] = createSignal(false);
  onMount(async () => {
    document.getElementById("auth-pre")?.remove();
    setProviders(await authProviders()); // revalidate against the Worker
  });

  // Unknown providers (first-ever visit) still render the button and offer both
  // options; the Worker is the authority and rejects any it hasn't enabled.
  const knownDisabled = () => {
    const p = providers();
    return p ? !p.github && !p.wikigit : false;
  };
  const choices = (): Provider[] => enabledProviders(providers());

  return (
    <>
      <Show when={session() || !knownDisabled()}>
        <Show
          when={session()}
          fallback={
            <button
              type="button"
              class="btn btn-outline btn-sm signin"
              onClick={() => setOpen(true)}
            >
              Sign in
            </button>
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
      <Show when={open() && !session()}>
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
              ref={(el) => onCleanup(dialogBehavior(el, () => setOpen(false)))}
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
  );
}
