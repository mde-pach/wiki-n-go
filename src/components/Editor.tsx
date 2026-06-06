import { createEffect, createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type EditResult, submitEdit } from "../lib/api";
import { fetchMarkdown, PageNotFoundError } from "../lib/content";
import { clearDraft, loadDraft, persistDraft } from "../lib/draft";
import { findSection } from "../lib/editor-section";
import { splitFrontmatter, withFrontmatter } from "../lib/frontmatter";
import { renderMarkdown } from "../lib/markdown";
import { prettify, readHref, slugFromLocation } from "../lib/paths";
import { useSubmit, useWhoami } from "../lib/solid";
import { templateById } from "../lib/templates";
import { errMessage } from "../lib/util";
import { ConfirmDialog } from "./editor/ConfirmDialog";
import { MarkdownToolbar } from "./editor/MarkdownToolbar";
import PageProperties, {
  assemble,
  extraFrom,
  type Fields,
  fieldsFrom,
} from "./PageProperties";
import { ErrorNote, ViewHead } from "./ui";

export default function Editor(props: { slug?: string; initialContent?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  // The textarea edits the body; the properties form edits the frontmatter;
  // they recombine into the saved document. `extra` keeps frontmatter keys the
  // form doesn't model (e.g. infobox) so they survive the round-trip.
  const init = splitFrontmatter(props.initialContent ?? "");
  const [body, setBody] = createSignal(init.body);
  const [fields, setFields] = createStore<Fields>(fieldsFrom(init.data));
  const [extra, setExtra] = createSignal<Record<string, unknown>>(extraFrom(init.data));
  const [original, setOriginal] = createSignal(props.initialContent ?? "");
  const [summary, setSummary] = createSignal("");
  const [result, setResult] = createSignal<EditResult>();
  const [modal, setModal] = createSignal(false);
  const { who } = useWhoami();
  const [ready, setReady] = createSignal(false);
  const [restored, setRestored] = createSignal(false);
  const [isNew, setIsNew] = createSignal(false);
  let ta: HTMLTextAreaElement | undefined;

  const { busy, error, setError, run, mount } = useSubmit();
  const content = () => withFrontmatter(assemble(extra(), fields), body());

  function applyDocument(doc: string) {
    const s = splitFrontmatter(doc);
    setBody(s.body);
    setFields(fieldsFrom(s.data));
    setExtra(extraFrom(s.data));
  }

  onMount(async () => {
    try {
      const raw = await fetchMarkdown(slug());
      setOriginal(raw);
      if (raw !== props.initialContent) applyDocument(raw);
    } catch (e) {
      if (e instanceof PageNotFoundError) {
        setIsNew(true);
        seedTemplate();
      } else setError(errMessage(e));
    }
    restoreDraft();
    setReady(true);
    queueMicrotask(focusSection);
  });

  // A new page reached with `?template=` (from the create wizard) starts from a
  // scaffold rather than blank; `?translationKey=` (from the language switcher's
  // "translate this page") seeds the key so the page joins its group on save.
  // A restored draft still wins over both.
  function seedTemplate() {
    if (isServer) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("template");
    const tkey = params.get("translationKey");
    if (!id && !tkey) return;
    let doc = id ? templateById(id).build(prettify(slug())) : content();
    if (tkey) {
      const { data, body } = splitFrontmatter(doc);
      doc = withFrontmatter({ ...data, translationKey: tkey }, body);
    }
    applyDocument(doc);
  }

  function restoreDraft() {
    const draft = loadDraft(slug(), content());
    if (!draft) return;
    applyDocument(draft.content);
    if (draft.summary) setSummary(draft.summary);
    setRestored(true);
  }

  createEffect(() => {
    const c = content();
    const s = summary();
    if (!ready()) return;
    persistDraft(slug(), c, s, original());
  });

  // Deep-link from a heading's `[edit]`: select that section and seed a summary.
  function focusSection() {
    if (isServer || !ta) return;
    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) return;
    const span = findSection(body(), section);
    if (!span) return;
    if (!summary().trim()) setSummary(`Edit ${span.heading} section`);
    ta.focus();
    ta.setSelectionRange(span.start, span.end);
    ta.scrollTop = (span.start / Math.max(1, body().length)) * ta.scrollHeight;
  }

  const preview = () =>
    isServer ? "" : renderMarkdown(body() || "_Nothing to preview yet._");
  const cancelHref = () => readHref(slug());
  const delta = () => content().length - original().length;

  function wrap(before: string, after = before) {
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = body();
    setBody(v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e));
    ta.focus();
    queueMicrotask(() => {
      if (ta) ta.selectionStart = ta.selectionEnd = e + before.length + after.length;
    });
  }
  function prefixLine(prefix: string) {
    if (!ta) return;
    const s = ta.selectionStart;
    const v = body();
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    setBody(v.slice(0, lineStart) + prefix + v.slice(lineStart));
    ta.focus();
  }

  function openConfirm() {
    setError(undefined);
    setModal(true);
  }
  function confirmSubmit() {
    // Close the confirm dialog first so an in-panel bot-check (if Cloudflare
    // asks for one) is reachable rather than behind the modal backdrop.
    setModal(false);
    run(async (tok) => {
      setResult(await submitEdit(slug(), content(), tok, summary()));
      clearDraft(slug());
    });
  }

  return (
    <div>
      <ViewHead
        title={
          <>
            {isNew() ? "Creating" : "Editing"} “{prettify(slug())}”
          </>
        }
        sub="Anyone can edit — no account needed. Trusted edits publish immediately; others are submitted for review and go live once a maintainer approves."
      />

      <PageProperties
        fields={fields}
        setField={(k, v) => setFields(k, v)}
        tier={who()?.tier}
      />

      <div class="editor-shell">
        <div class="editor-pane">
          <div class="pane-bar">
            <span class="pane-name">Markdown</span>
            <MarkdownToolbar wrap={wrap} prefixLine={prefixLine} />
          </div>
          <textarea
            ref={ta}
            class="editor-textarea"
            rows={20}
            value={body()}
            placeholder="Write Markdown…"
            onInput={(e) => setBody(e.currentTarget.value)}
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
            Signed as{" "}
            <span class="pseudonym">{who()?.author ?? "anon · your IP, hashed"}</span>
            <Show when={who()}>
              {(w) => <span class="tier-badge"> · {w().tier}</span>}
            </Show>
          </div>
          <Show when={restored()}>
            <p class="editor-hint">Restored your unsaved draft from this device.</p>
          </Show>
          <Show when={config.turnstileSiteKey}>
            <div class="editor-widget" ref={(el) => mount?.(el)} />
          </Show>
          <div class="editor-actions" style={{ "margin-top": "0.9rem" }}>
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy() || !body().trim()}
              onClick={openConfirm}
            >
              Publish…
            </button>
            <a class="btn btn-ghost" href={cancelHref()}>
              Cancel
            </a>
          </div>
          <ErrorNote msg={error()} />
          <Show when={result()}>
            {(r) => (
              <p class="editor-ok">
                <Show
                  when={r().live}
                  fallback={
                    <>
                      Submitted for review —{" "}
                      <a href={r().prUrl} target="_blank" rel="noreferrer">
                        track its status
                      </a>
                      .
                    </>
                  }
                >
                  Published live — <a href={cancelHref()}>view the page</a> ·{" "}
                  <a href={r().url} target="_blank" rel="noreferrer">
                    see the change
                  </a>
                  .
                </Show>
              </p>
            )}
          </Show>
        </div>
      </div>

      <Show when={modal()}>
        <ConfirmDialog
          title="Submit this change"
          subtitle="Depending on your trust level and the page, this either publishes immediately or is submitted for review."
          body={
            <>
              <p>
                Summary: <strong>{summary() || "(none)"}</strong>
              </p>
              <p>
                Size:{" "}
                <span class="mono">
                  {original().length} → {content().length} chars (
                  {delta() >= 0 ? "+" : ""}
                  {delta()})
                </span>
              </p>
            </>
          }
          confirmLabel={busy() ? "Submitting…" : "Submit change"}
          cancelLabel="Back"
          busy={busy()}
          onConfirm={confirmSubmit}
          onCancel={() => setModal(false)}
        />
      </Show>
    </div>
  );
}
