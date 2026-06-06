import { createSignal, onMount, Show } from "solid-js";
import { authEnabled, authEnabledCached, getSession, login, logout } from "../lib/auth";

export default function AuthButton() {
  // Resolve from synchronous state at hydration so the chrome doesn't blink in
  // after a Worker round-trip: a stored session means signed-in immediately, and
  // the "Sign in" button uses the last-known enabled flag. Visibility still
  // follows the Worker's runtime state (revalidated in the background below), so
  // turning sign-in on needs only a Worker deploy — no rebuild, no build flag.
  const [session] = createSignal(getSession());
  const [enabled, setEnabled] = createSignal(authEnabledCached());
  onMount(async () => setEnabled(await authEnabled()));

  return (
    <Show when={session() || enabled()}>
      <Show
        when={session()}
        fallback={
          <button
            type="button"
            class="btn btn-outline btn-sm signin"
            onClick={() => login()}
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
  );
}
