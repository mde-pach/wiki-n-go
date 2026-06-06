import { createResource, createSignal, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { authEnabled, getSession, login, logout } from "../lib/auth";

export default function AuthButton() {
  // Visibility follows the Worker's runtime state, so turning sign-in on needs
  // only a Worker deploy — no site rebuild, no build-time flag.
  const [enabled] = createResource(() => (isServer ? undefined : true), authEnabled);
  const [session] = createSignal(getSession());

  return (
    <Show when={enabled()}>
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
