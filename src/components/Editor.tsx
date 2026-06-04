import { createSignal, Show } from "solid-js";
import { config } from "../config";
import { submitEdit } from "../lib/api";
import { fetchMarkdown, PageNotFoundError } from "../lib/content";
import { slugFromLocation } from "../lib/slug";
import { renderTurnstile } from "../lib/turnstile";

export default function Editor(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [prUrl, setPrUrl] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [token, setToken] = createSignal<string>();

  function mountWidget(el: HTMLDivElement) {
    if (!config.turnstileSiteKey) return;
    renderTurnstile(el, config.turnstileSiteKey, setToken).catch((e) =>
      setError(message(e)),
    );
  }

  async function start() {
    setBusy(true);
    setError();
    setPrUrl();
    try {
      setDraft(await fetchMarkdown(slug()));
    } catch (e) {
      if (e instanceof PageNotFoundError) setDraft("");
      else {
        setError(message(e));
        setBusy(false);
        return;
      }
    }
    setOpen(true);
    setBusy(false);
  }

  async function propose() {
    if (config.turnstileSiteKey && !token()) {
      setError("Please complete the bot check.");
      return;
    }
    setBusy(true);
    setError();
    try {
      const result = await submitEdit(slug(), draft(), token());
      setPrUrl(result.prUrl);
      setOpen(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="editor">
      <Show when={!open()}>
        <button type="button" class="editor-toggle" disabled={busy()} onClick={start}>
          {busy() ? "Loading…" : "Edit this page"}
        </button>
      </Show>

      <Show when={open()}>
        <textarea
          class="editor-area"
          rows={18}
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <div class="editor-widget" ref={mountWidget} />
        <div class="editor-actions">
          <button type="button" disabled={busy()} onClick={propose}>
            {busy() ? "Submitting…" : "Propose edit"}
          </button>
          <button
            type="button"
            class="ghost"
            disabled={busy()}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      </Show>

      <Show when={prUrl()}>
        <p class="editor-ok">
          Edit proposed —{" "}
          <a href={prUrl()} target="_blank" rel="noreferrer">
            review it here
          </a>
          .
        </p>
      </Show>
      <Show when={error()}>
        <p class="editor-err">{error()}</p>
      </Show>
    </section>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
