import { createSignal, onMount, Show } from "solid-js";
import {
  authProviders,
  authProvidersCached,
  getSession,
  login,
  logout,
} from "../lib/auth";

export default function AuthButton() {
  // Resolve from synchronous state at hydration so the chrome doesn't blink in
  // after a Worker round-trip: a stored session means signed-in immediately, and
  // the sign-in buttons use the last-known provider flags. Visibility still
  // follows the Worker's runtime state (revalidated in the background below), so
  // turning a provider on needs only a Worker deploy — no rebuild, no build flag.
  const [session] = createSignal(getSession());
  const [providers, setProviders] = createSignal(authProvidersCached());
  onMount(async () => setProviders(await authProviders()));

  const any = () => Boolean(providers()?.github || providers()?.wikigit);
  const both = () => Boolean(providers()?.github && providers()?.wikigit);

  return (
    <Show when={session() || any()}>
      <Show
        when={session()}
        fallback={
          // One provider → a single "Sign in" (unchanged). Both → labeled buttons.
          <Show
            when={both()}
            fallback={
              <button
                type="button"
                class="btn btn-outline btn-sm signin"
                onClick={() => login(providers()?.wikigit ? "wikigit" : "github")}
              >
                Sign in
              </button>
            }
          >
            <div class="signin">
              <button
                type="button"
                class="btn btn-outline btn-sm"
                aria-label="Sign in with GitHub"
                onClick={() => login("github")}
              >
                GitHub
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                aria-label="Sign in with Wikigit"
                onClick={() => login("wikigit")}
              >
                Wikigit
              </button>
            </div>
          </Show>
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
