import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { grantEditor, listEditors, revokeEditor } from "../lib/admin";
import { useFormAction } from "../lib/solid";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function Rights() {
  const [data, { refetch }] = createResource(
    () => (isServer ? undefined : true),
    listEditors,
  );
  const [key, setKey] = createSignal("");
  const { busy, error, run } = useFormAction();

  async function grant(e: Event) {
    e.preventDefault();
    const k = key().trim();
    if (!k) return;
    await run(async () => {
      await grantEditor(k);
      setKey("");
      refetch();
    });
  }

  async function revoke(k: string) {
    await run(async () => {
      await revokeEditor(k);
      refetch();
    });
  }

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Rights"
        sub="Grant maintainer access by adding an anon-… hash or GitHub login to trusted-editors.json. The repo owner is always a maintainer."
      />

      <form class="ban-form" onSubmit={grant}>
        <input
          class="ban-input"
          aria-label="Editor to grant or revoke (anon hash or GitHub login)"
          placeholder="anon-… hash or GitHub login"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
        />
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={busy() || !key().trim()}
        >
          Grant
        </button>
      </form>

      <ErrorNote msg={error()} />

      <Show when={data()} fallback={<Status>Loading editors…</Status>}>
        <ul class="ban-list">
          <li class="ban-row">
            <span class="ban-key">{data()?.owner}</span>
            <span class="ban-scope">owner</span>
            <span />
            <span />
            <span />
          </li>
          <For each={data()?.editors}>
            {(ed) => (
              <li class="ban-row">
                <span class="ban-key">{ed}</span>
                <span class="ban-scope partial">maintainer</span>
                <span />
                <span />
                <button
                  type="button"
                  class="link-btn ban-unblock"
                  onClick={() => revoke(ed)}
                >
                  revoke
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </main>
  );
}
