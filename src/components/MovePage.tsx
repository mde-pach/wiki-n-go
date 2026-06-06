import { createMemo, createSignal, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { movePage } from "../lib/move";
import { prettify, readHref, slugifyTarget } from "../lib/paths";
import { createTurnstile } from "../lib/turnstile";
import { errMessage } from "../lib/util";

export default function MovePage() {
  const from = isServer ? "" : (new URLSearchParams(location.search).get("page") ?? "");
  const [target, setTarget] = createSignal(prettify(from));
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [done, setDone] = createSignal<string>();
  const turnstile = config.turnstileSiteKey
    ? createTurnstile(config.turnstileSiteKey)
    : null;
  const toSlug = createMemo(() => slugifyTarget(target()));

  async function submit() {
    setErr();
    if (!toSlug()) return setErr("Enter a new name.");
    if (toSlug() === from) return setErr("That's the current name.");
    setBusy(true);
    try {
      const tok = turnstile ? await turnstile.getToken() : undefined;
      const r = await movePage(from, toSlug(), summary(), tok);
      setDone(r.to);
    } catch (e) {
      setErr(errMessage(e));
      turnstile?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="move-page">
      <div class="view-head">
        <h2>Move or rename a page</h2>
        <p>
          Renaming leaves a redirect at the old name, so existing links keep working.
        </p>
      </div>

      <Show
        when={from}
        fallback={
          <p class="wiki-status">
            No page specified — open this from a page's “Move/rename” link.
          </p>
        }
      >
        <Show
          when={done()}
          fallback={
            <div class="move-form">
              <label class="field-label">
                Current page
                <input class="input mono" value={from} disabled />
              </label>
              <label class="field-label">
                New name
                <input
                  class="input"
                  value={target()}
                  placeholder="New title or slug"
                  onInput={(e) => setTarget(e.currentTarget.value)}
                />
              </label>
              <p class="field-hint">
                New address: <span class="mono">{toSlug() || "…"}</span>
              </p>
              <label class="field-label">
                Reason (optional)
                <input
                  class="input"
                  value={summary()}
                  onInput={(e) => setSummary(e.currentTarget.value)}
                />
              </label>
              <div class="editor-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={busy()}
                  onClick={submit}
                >
                  {busy() ? "Moving…" : "Move page"}
                </button>
                <a class="btn btn-ghost" href={readHref(from)}>
                  Cancel
                </a>
              </div>
              <Show when={err()}>
                <p class="editor-err">{err()}</p>
              </Show>
            </div>
          }
        >
          {(to) => (
            <p class="editor-ok">
              Moved to <a href={readHref(to())}>{prettify(to())}</a>. A redirect was
              left at <span class="mono">{from}</span>.
            </p>
          )}
        </Show>
      </Show>
    </div>
  );
}
