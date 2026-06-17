import { createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { addBan, type Ban, listBans, removeBan } from "../lib/admin";
import { timeAgo } from "../lib/format";
import { errMessage } from "../lib/util";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function Bans() {
  const [bans, { mutate, refetch }] = createResource(
    () => (isServer ? undefined : true),
    listBans,
  );
  const [key, setKey] = createSignal("");
  const [paths, setPaths] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [expires, setExpires] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function submit(e: Event) {
    e.preventDefault();
    const k = key().trim();
    if (!k) return;
    setBusy(true);
    setError();
    try {
      const scope = paths()
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await addBan(
        k,
        scope,
        reason().trim() || undefined,
        expires().trim() || undefined,
      );
      setKey("");
      setPaths("");
      setReason("");
      setExpires("");
      refetch();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function unban(k: string) {
    const prev = bans();
    mutate((list) => list?.filter((b) => b.key !== k));
    try {
      await removeBan(k);
    } catch (e) {
      setError(errMessage(e));
      mutate(prev);
    }
  }

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Blocks"
        sub="Banned sources, site-wide or scoped to paths. Stored in bans.json — git is the record."
      />

      <form class="ban-form" onSubmit={submit}>
        <input
          class="ban-input"
          aria-label="Editor to ban (anon hash or GitHub login)"
          placeholder="anon-… hash or GitHub login"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
        />
        <input
          class="ban-input"
          aria-label="Path scope (optional, comma-separated)"
          placeholder="path scope — optional, comma-separated"
          value={paths()}
          onInput={(e) => setPaths(e.currentTarget.value)}
        />
        <input
          class="ban-input"
          aria-label="Reason (optional)"
          placeholder="reason — optional"
          value={reason()}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <input
          class="ban-input"
          aria-label="Expiry (optional, e.g. 24h, 7d)"
          placeholder="expires — e.g. 24h, 7d (optional)"
          value={expires()}
          onInput={(e) => setExpires(e.currentTarget.value)}
        />
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={busy() || !key().trim()}
        >
          Block
        </button>
      </form>

      <ErrorNote msg={error()} />

      <Show when={bans()} fallback={<Status>Loading blocks…</Status>}>
        <Show
          when={(bans()?.length ?? 0) > 0}
          fallback={<Status>No active blocks.</Status>}
        >
          <ul class="ban-list">
            <For each={bans()}>
              {(b: Ban) => (
                <li class="ban-row">
                  <span class="ban-key">{b.key}</span>
                  <span class="ban-scope" classList={{ partial: b.paths.length > 0 }}>
                    {b.paths.length > 0 ? b.paths.join(", ") : "site-wide"}
                  </span>
                  <span class="ban-reason">{b.reason}</span>
                  <span class="ban-meta">
                    {b.by}
                    {b.at ? ` · ${timeAgo(b.at)}` : ""}
                    {b.expires ? ` · expires ${timeAgo(b.expires)}` : ""}
                  </span>
                  <button
                    type="button"
                    class="link-btn ban-unblock"
                    onClick={() => unban(b.key)}
                  >
                    unblock
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
