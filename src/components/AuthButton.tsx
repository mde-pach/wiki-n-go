import { createSignal, Show } from "solid-js";
import { config } from "../config";
import { getSession, login, logout } from "../lib/auth";

export default function AuthButton() {
  if (!config.oauthEnabled) return null;
  const [session] = createSignal(getSession());

  return (
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
  );
}
