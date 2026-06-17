import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type EditResult, type Progress, submitEdit } from "../lib/api";
import { fetchMarkdown, fetchMarkdownAt, PageNotFoundError } from "../lib/content";
import { renderMermaid } from "../lib/decorate";
import { diffLines } from "../lib/diff";
import {
  clearDraft,
  deleteNamedDraft,
  getNamedDraft,
  loadDraft,
  persistDraft,
  saveNamedDraft,
} from "../lib/draft";
import { findSection } from "../lib/editor-section";
import { splitFrontmatter, withFrontmatter } from "../lib/frontmatter";
import { renderMarkdown } from "../lib/markdown";
import {
  BASE,
  prettify,
  queryParam,
  readHref,
  slugFromLocation,
  userLogin,
} from "../lib/paths";
import { createDebounced, useSubmit, useWhoami } from "../lib/solid";
import { templateById } from "../lib/templates";
import { errMessage } from "../lib/util";
import DraftList from "./DraftList";
import { MarkdownToolbar } from "./editor/MarkdownToolbar";
import {
  AttributionRow,
  PublishProgress,
  SubmitConfirm,
  useTextareaTools,
} from "./editor/shared";
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
  // The named draft being resumed (deleted once it publishes); `draftName` feeds
  // the save field; `draftSaved` is bumped to refresh the saved-drafts list.
  const [activeDraftId, setActiveDraftId] = createSignal<string>();
  const [draftName, setDraftName] = createSignal("");
  const [draftSaved, setDraftSaved] = createSignal(0);
  let ta: HTMLTextAreaElement | undefined;

  const { busy, error, setError, run } = useSubmit();
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
    applyNamedDraft();
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
    const sha = queryParam("revert");
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
    const id = queryParam("template");
    const tkey = queryParam("translationKey");
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

  // Resume a named draft reached with `?draft=<id>` (from the saved-drafts list).
  // Wins over the scratch autosave; an explicit `?revert=` still wins over it.
  function applyNamedDraft() {
    if (isServer) return;
    const id = queryParam("draft");
    if (!id) return;
    const draft = getNamedDraft(id);
    if (!draft) return;
    applyDocument(draft.content);
    setSummary(draft.summary);
    setActiveDraftId(draft.id);
    setDraftName(draft.name);
    setRestored(false);
  }

  // Snapshot the current work as a named draft (client-side only — no PR, no
  // write path). Reuses the resumed draft's id so re-saving updates in place.
  function saveDraft() {
    if (!body().trim()) return setError("Nothing to save yet.");
    const name = draftName().trim() || summary().trim() || prettify(slug());
    const saved = saveNamedDraft({
      id: activeDraftId(),
      name,
      slug: slug(),
      content: content(),
      summary: summary(),
    });
    setActiveDraftId(saved.id);
    setDraftName(saved.name);
    setDraftSaved((n) => n + 1);
  }

  // Autosave is debounced so a fast typist doesn't reserialize the whole document
  // to localStorage on every keystroke.
  const draftSnapshot = createDebounced(() => ({ c: content(), s: summary() }), 800);
  createEffect(() => {
    const { c, s } = draftSnapshot();
    if (!ready()) return;
    persistDraft(slug(), c, s, original());
  });

  // Deep-link from a heading's `[edit]`: select that section and seed a summary.
  function focusSection() {
    if (isServer || !ta) return;
    const section = queryParam("section");
    if (!section) return;
    const span = findSection(body(), section);
    if (!span) return;
    if (!summary().trim()) setSummary(`Edit ${span.heading} section`);
    ta.focus();
    ta.setSelectionRange(span.start, span.end);
    ta.scrollTop = (span.start / Math.max(1, body().length)) * ta.scrollHeight;
  }

  // Debounced so full markdown-it + DOMPurify re-render doesn't run synchronously
  // on every keystroke; the mermaid pass downstream is debounced separately.
  const debouncedBody = createDebounced(body, 150);
  const preview = createMemo(() =>
    isServer ? "" : renderMarkdown(debouncedBody() || "_Nothing to preview yet._"),
  );

  // The published page renders ```mermaid fences via a client pass; mirror just
  // that pass on the preview so diagrams (and other client-rendered extensions)
  // show identically instead of as a raw code block (T8). A MutationObserver on
  // the preview re-runs the pass whenever its HTML changes, debounced so a fast
  // typist doesn't re-run the diagram engine on every keystroke.
  let mermaidTimer: number | undefined;
  const setPreviewRef = (el: HTMLDivElement) => {
    if (isServer) return;
    const run = () => {
      clearTimeout(mermaidTimer);
      mermaidTimer = window.setTimeout(() => void renderMermaid(el), 150);
    };
    new MutationObserver(run).observe(el, { childList: true, subtree: true });
    run();
  };

  const cancelHref = () => readHref(slug());

  // Narrow the result union per case so each branch sees only its own fields.
  const resultOf = <K extends EditResult["kind"]>(kind: K) => {
    const r = result();
    return r?.kind === kind ? (r as Extract<EditResult, { kind: K }>) : undefined;
  };

  // Computed only while the confirm dialog is open, so it never costs anything
  // per keystroke. Empty (no net change) → null, so DiffView shows its
  // no-change fallback.
  const previewDiff = createMemo(() => {
    if (!modal()) return null;
    const lines = diffLines(original(), content());
    return lines.length ? lines : null;
  });

  const { wrap, prefixLine } = useTextareaTools(() => ta, body, setBody);

  function openConfirm() {
    setError(undefined);
    setModal(true);
  }
  function confirmSubmit() {
    // Close the confirm dialog first so the publish progress is visible rather
    // than behind the modal backdrop.
    setModal(false);
    setProgress({ progress: 0, label: "Starting" });
    run(async (tok) => {
      setResult(await submitEdit(slug(), content(), tok, summary(), setProgress));
      clearDraft(slug());
      // The work is published, so its saved draft (if any) is now stale.
      const id = activeDraftId();
      if (id) deleteNamedDraft(id);
      setActiveDraftId(undefined);
      setDraftSaved((n) => n + 1);
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
              // `prop:value`, not `value`: Solid SSRs a plain `value` as an
              // attribute, which a <textarea> ignores (it renders child text
              // only) and hydration never repaints — so the box paints empty
              // for existing pages. `prop:` forces the property assignment.
              prop:value={body()}
              placeholder="Write Markdown…"
              onInput={(e) => setBody(e.currentTarget.value)}
            />
          </div>

          <div class="preview-pane">
            <div class="pane-bar">
              <span class="live-dot" />
              <span class="pane-name">Preview</span>
            </div>
            <div
              class="preview-scroll prose"
              ref={setPreviewRef}
              innerHTML={preview()}
            />
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
          <AttributionRow who={who()} />
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
          <div class="draft-save">
            <label class="field-label" for="draft-name">
              Save as draft
            </label>
            <div class="draft-save-row">
              <input
                id="draft-name"
                class="input"
                value={draftName()}
                placeholder="Draft name (optional)"
                onInput={(e) => setDraftName(e.currentTarget.value)}
              />
              <button
                type="button"
                class="btn btn-ghost"
                disabled={!body().trim()}
                onClick={saveDraft}
              >
                Save draft
              </button>
            </div>
            <Show when={draftSaved() > 0 && activeDraftId()}>
              <p class="editor-hint">
                Saved to this device — resume it later from here or the{" "}
                <a href={`${BASE}/new`}>create page</a>.
              </p>
            </Show>
          </div>
          <PublishProgress busy={busy()} progress={progress()} />
          <ErrorNote msg={error()} />
          <Switch>
            <Match when={resultOf("reverted")}>
              <p class="editor-ok editor-reverted" role="alert">
                This edit was automatically reverted as likely vandalism. If that's
                wrong, re-edit the page or raise it on the talk page — a maintainer can
                restore it.
              </p>
            </Match>
            <Match when={resultOf("pending")}>
              {(r) => (
                <p class="editor-ok">
                  Submitted for review —{" "}
                  <a href={r().prUrl} target="_blank" rel="noreferrer">
                    track its status
                  </a>
                  .
                </p>
              )}
            </Match>
            <Match when={resultOf("live")}>
              {(r) => (
                <p class="editor-ok">
                  Published live — <a href={cancelHref()}>view the page</a>
                  <Show when={r().url}>
                    {" "}
                    ·{" "}
                    <a href={r().url} target="_blank" rel="noreferrer">
                      see the change
                    </a>
                  </Show>
                  .
                </p>
              )}
            </Match>
          </Switch>
        </div>

        <DraftList
          slug={slug()}
          heading="Saved drafts for this page"
          refresh={draftSaved}
        />

        <Show when={modal()}>
          <SubmitConfirm
            summary={summary()}
            fromLen={original().length}
            toLen={content().length}
            lines={previewDiff()}
            aLabel={isNew() ? "(new page)" : "current"}
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
