import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type EditResult, type Progress, submitEdit } from "../lib/api";
import { fetchMarkdown, fetchMarkdownAt, PageNotFoundError } from "../lib/content";
import { diffLines } from "../lib/diff";
import { clearDraft, loadDraft, persistDraft } from "../lib/draft";
import { findSection } from "../lib/editor-section";
import { splitFrontmatter, withFrontmatter } from "../lib/frontmatter";
import { renderMarkdown } from "../lib/markdown";
import { prettify, readHref, slugFromLocation, userLogin } from "../lib/paths";
import { useSubmit, useWhoami } from "../lib/solid";
import { templateById } from "../lib/templates";
import { errMessage } from "../lib/util";
import DiffView from "./DiffView";
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
  const [progress, setProgress] = createSignal<Progress>();
  const [modal, setModal] = createSignal(false);
  const { who } = useWhoami();
  const [ready, setReady] = createSignal(false);
  const [restored, setRestored] = createSignal(false);
  const [reverting, setReverting] = createSignal<string>();
  const [isNew, setIsNew] = createSignal(false);
  let ta: HTMLTextAreaElement | undefined;

  const { busy, error, setError, run, mount } = useSubmit();
  const content = () => withFrontmatter(assemble(extra(), fields), body());

  // A `user/<login>` profile is editable only by its owner (mirrors the Worker
  // gate — not even maintainers edit profile content), so don't show the form to
  // anyone else; they'd only hit a 403 on save. `loading` while whoami is in
  // flight avoids flashing the editor before we know who they are.
  const profileOwner = () => userLogin(slug());
  const editGate = (): "ok" | "loading" | "denied" => {
    const owner = profileOwner();
    if (!owner) return "ok";
    const w = who();
    if (!w) return "loading";
    return !w.isAnon && w.author.toLowerCase() === owner.toLowerCase()
      ? "ok"
      : "denied";
  };

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
    await applyRevert();
    setReady(true);
    queueMicrotask(focusSection);
  });

  // History's "undo" links here with `?revert=<sha>`: load that revision's
  // content as the edit, keeping `original()` as the *current* page so the diff
  // preview and conflict check compare against what's live. An explicit revert
  // wins over a restored draft. `baseSha` stays the current blob.
  async function applyRevert() {
    if (isServer) return;
    const sha = new URLSearchParams(window.location.search).get("revert");
    if (!sha) return;
    try {
      applyDocument(await fetchMarkdownAt(slug(), sha));
      if (!summary().trim()) setSummary(`Revert to revision ${sha.slice(0, 7)}`);
      setReverting(sha.slice(0, 7));
    } catch (e) {
      setError(errMessage(e));
    }
  }

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

  // Computed only while the confirm dialog is open, so it never costs anything
  // per keystroke. Empty (no net change) → null, so DiffView shows its
  // no-change fallback.
  const previewDiff = createMemo(() => {
    if (!modal()) return null;
    const lines = diffLines(original(), content());
    return lines.length ? lines : null;
  });

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
    setProgress({ progress: 0, label: "Starting" });
    run(async (tok) => {
      setResult(await submitEdit(slug(), content(), tok, summary(), setProgress));
      clearDraft(slug());
    });
  }

  return (
    <Show
      when={editGate() === "ok"}
      fallback={<EditGate state={editGate()} slug={slug()} />}
    >
      <div>
        <ViewHead
          title={
            <>
              {isNew() ? "Creating" : "Editing"} “{prettify(slug())}”
            </>
          }
          sub="Anyone can edit — no account needed. Trusted edits publish immediately; others go to review first."
        />

        <PageProperties
          fields={fields}
          setField={(k, v) => setFields(k, v)}
          tier={who()?.tier}
          open={isNew()}
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

        <div class="publish-bar">
          <div class="publish-row">
            <input
              id="edit-summary"
              class="input"
              value={summary()}
              aria-label="Edit summary"
              placeholder="Summarize your change (optional)"
              onInput={(e) => setSummary(e.currentTarget.value)}
            />
            <div class="editor-actions">
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
          </div>
          <div class="attribution-row">
            Signed as{" "}
            <span class="pseudonym">{who()?.author ?? "anon · your IP, hashed"}</span>
            <Show when={who()}>
              {(w) => <span class="tier-badge"> · {w().tier}</span>}
            </Show>
          </div>
          <Show when={reverting()}>
            {(rev) => (
              <p class="editor-hint">
                Reverting to revision <code>{rev()}</code> — review the diff before you
                publish.
              </p>
            )}
          </Show>
          <Show when={restored()}>
            <p class="editor-hint">Restored your unsaved draft from this device.</p>
          </Show>
          <Show when={config.turnstileSiteKey}>
            <div class="editor-widget" ref={(el) => mount?.(el)} />
          </Show>
          <Show when={busy() && progress()}>
            {(p) => (
              <div class="publish-progress" role="status" aria-live="polite">
                <div class="publish-progress-head">
                  <span>{p().label}…</span>
                  <span class="mono">{Math.round(p().progress * 100)}%</span>
                </div>
                <div class="publish-progress-track">
                  <div
                    class="publish-progress-fill"
                    style={{ width: `${Math.max(4, p().progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </Show>
          <ErrorNote msg={error()} />
          <Show when={result()}>
            {(r) => (
              <Show
                when={!r().autoReverted}
                fallback={
                  <p class="editor-ok editor-reverted" role="alert">
                    This edit was automatically reverted as likely vandalism. If that's
                    wrong, re-edit the page or raise it on the talk page — a maintainer
                    can restore it.
                  </p>
                }
              >
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
                    Published live — <a href={cancelHref()}>view the page</a>
                    <Show when={r().url}>
                      {" "}
                      ·{" "}
                      <a href={r().url} target="_blank" rel="noreferrer">
                        see the change
                      </a>
                    </Show>
                    .
                  </Show>
                </p>
              </Show>
            )}
          </Show>
        </div>

        <Show when={modal()}>
          <ConfirmDialog
            title="Submit this change"
            subtitle="Depending on your trust level and the page, this either publishes immediately or is submitted for review."
            wide
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
                <p class="field-label" style={{ "margin-bottom": "0.4rem" }}>
                  Changes
                </p>
                <DiffView
                  lines={previewDiff()}
                  a={isNew() ? "(new page)" : "current"}
                  b="your edit"
                  initialMode="unified"
                />
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
    </Show>
  );
}

// Shown instead of the editor when the current user may not edit a profile page.
function EditGate(props: { state: "loading" | "denied"; slug: string }) {
  const owner = () => userLogin(props.slug) ?? "";
  return (
    <div class="view-wrap">
      <Show
        when={props.state === "denied"}
        fallback={<p class="wiki-status">Checking permissions…</p>}
      >
        <ViewHead title="Profile page" />
        <p class="wiki-status">
          This is <span class="mono">@{owner()}</span>'s profile page. Only{" "}
          <span class="mono">@{owner()}</span> can edit it, signed in with GitHub.{" "}
          <a href={readHref(props.slug)}>Back to the page</a>.
        </p>
      </Show>
    </div>
  );
}
