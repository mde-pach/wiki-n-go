import { createSignal, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { submitEdit } from "../lib/api";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { slugFromLocation } from "../lib/slug";
import { renderTurnstile } from "../lib/turnstile";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function prettify(slug: string): string {
  const s = slug.split("/").pop() ?? slug;
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function Editor(props: { slug?: string; initialContent?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const [draft, setDraft] = createSignal(props.initialContent ?? "");
  const [original, setOriginal] = createSignal(props.initialContent ?? "");
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [token, setToken] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [prUrl, setPrUrl] = createSignal<string>();
  const [modal, setModal] = createSignal(false);
  let ta: HTMLTextAreaElement | undefined;

  onMount(async () => {
    try {
      const raw = await fetchMarkdown(slug());
      setOriginal(raw);
      if (raw !== props.initialContent) setDraft(raw);
    } catch (e) {
      if (!(e instanceof PageNotFoundError)) setError(message(e));
    }
  });

  const preview = () =>
    isServer ? "" : renderMarkdown(draft() || "_Nothing to preview yet._");
  const readHref = `${BASE}/${slug() === config.homeSlug ? "" : slug()}`;
  const delta = () => draft().length - original().length;

  function wrap(before: string, after = before) {
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = draft();
    setDraft(v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e));
    ta.focus();
    queueMicrotask(() => {
      if (ta) ta.selectionStart = ta.selectionEnd = e + before.length + after.length;
    });
  }
  function prefixLine(prefix: string) {
    if (!ta) return;
    const s = ta.selectionStart;
    const v = draft();
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    setDraft(v.slice(0, lineStart) + prefix + v.slice(lineStart));
    ta.focus();
  }

  function mountWidget(el: HTMLDivElement) {
    if (!config.turnstileSiteKey) return;
    renderTurnstile(el, config.turnstileSiteKey, setToken).catch((e) =>
      setError(message(e)),
    );
  }

  function openConfirm() {
    setError();
    if (config.turnstileSiteKey && !token()) {
      setError("Please complete the bot check.");
      return;
    }
    setModal(true);
  }
  async function confirmSubmit() {
    setBusy(true);
    setError();
    try {
      const result = await submitEdit(slug(), draft(), token(), summary());
      setPrUrl(result.prUrl);
      setModal(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div class="view-head">
        <h2>Editing “{prettify(slug())}”</h2>
        <p>
          Anyone can edit — no account needed. Publishing opens a reviewed pull request;
          it won't change the live page until a maintainer merges it.
        </p>
      </div>

      <div class="editor-shell">
        <div class="editor-pane">
          <div class="pane-bar">
            <span class="pane-name">Markdown</span>
            <div class="md-toolbar">
              <button
                type="button"
                class="md-btn"
                title="Bold"
                onClick={() => wrap("**")}
              >
                B
              </button>
              <button
                type="button"
                class="md-btn"
                title="Italic"
                onClick={() => wrap("_")}
              >
                I
              </button>
              <span class="md-sep" />
              <button
                type="button"
                class="md-btn"
                title="Heading"
                onClick={() => prefixLine("## ")}
              >
                H
              </button>
              <button
                type="button"
                class="md-btn"
                title="List"
                onClick={() => prefixLine("- ")}
              >
                •
              </button>
              <button
                type="button"
                class="md-btn"
                title="Quote"
                onClick={() => prefixLine("> ")}
              >
                ”
              </button>
              <span class="md-sep" />
              <button
                type="button"
                class="md-btn"
                title="Wiki link"
                onClick={() => wrap("[[", "]]")}
              >
                [[ ]]
              </button>
              <button
                type="button"
                class="md-btn"
                title="Code"
                onClick={() => wrap("`")}
              >
                {"`"}
              </button>
            </div>
          </div>
          <textarea
            ref={ta}
            class="editor-textarea"
            rows={20}
            value={draft()}
            placeholder="Write Markdown…"
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
        </div>

        <div class="preview-pane">
          <div class="pane-bar">
            <span class="live-dot" />
            <span class="pane-name">Preview</span>
          </div>
          <div class="preview-scroll prose" innerHTML={preview()} />
        </div>
      </div>

      <div class="edit-sidebar" style={{ "margin-top": "1.1rem" }}>
        <div class="panel">
          <h3>Publish your change</h3>
          <label class="field-label" for="edit-summary">
            Edit summary
          </label>
          <input
            id="edit-summary"
            class="input"
            value={summary()}
            placeholder="Briefly describe your change"
            onInput={(e) => setSummary(e.currentTarget.value)}
          />
          <div class="attribution-row" style={{ "margin-top": "0.8rem" }}>
            Signed as <span class="pseudonym">anon · your IP, hashed</span>
          </div>
          <Show when={config.turnstileSiteKey}>
            <div class="editor-widget" ref={mountWidget} />
          </Show>
          <div class="editor-actions" style={{ "margin-top": "0.9rem" }}>
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy() || !draft().trim()}
              onClick={openConfirm}
            >
              Publish…
            </button>
            <a class="btn btn-ghost" href={readHref}>
              Cancel
            </a>
          </div>
          <Show when={error()}>
            <p class="editor-err">{error()}</p>
          </Show>
          <Show when={prUrl()}>
            <p class="editor-ok">
              Proposed —{" "}
              <a href={prUrl()} target="_blank" rel="noreferrer">
                review the pull request
              </a>
              .
            </p>
          </Show>
        </div>
      </div>

      <Show when={modal()}>
        <div class="overlay">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-head">
              <div>
                <p class="mh-title">Propose this change</p>
                <p class="mh-sub">
                  This opens a reviewed pull request — the live page won't change until
                  a maintainer merges it.
                </p>
              </div>
            </div>
            <div class="modal-body">
              <p>
                Summary: <strong>{summary() || "(none)"}</strong>
              </p>
              <p>
                Size:{" "}
                <span class="mono">
                  {original().length} → {draft().length} chars (
                  {delta() >= 0 ? "+" : ""}
                  {delta()})
                </span>
              </p>
            </div>
            <div class="modal-foot">
              <button
                type="button"
                class="btn btn-primary"
                disabled={busy()}
                onClick={confirmSubmit}
              >
                {busy() ? "Submitting…" : "Submit pull request"}
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => setModal(false)}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
