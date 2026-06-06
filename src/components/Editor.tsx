import { createEffect, createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { config } from "../config";
import { type EditResult, getWhoami, submitEdit, type Tier } from "../lib/api";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import { splitFrontmatter, withFrontmatter } from "../lib/frontmatter";
import { slugifyHeading } from "../lib/markdown";
import { prettify, readHref } from "../lib/paths";
import { slugFromLocation } from "../lib/slug";
import { templateById } from "../lib/templates";
import { createTurnstile } from "../lib/turnstile";
import { errMessage } from "../lib/util";
import { Icons } from "./Icons";
import PageProperties, {
  assemble,
  extraFrom,
  type Fields,
  fieldsFrom,
} from "./PageProperties";

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
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [result, setResult] = createSignal<EditResult>();
  const [modal, setModal] = createSignal(false);
  const [who, setWho] = createSignal<{ author: string; tier: Tier }>();
  const [ready, setReady] = createSignal(false);
  const [restored, setRestored] = createSignal(false);
  const [isNew, setIsNew] = createSignal(false);
  let ta: HTMLTextAreaElement | undefined;

  const turnstile = config.turnstileSiteKey
    ? createTurnstile(config.turnstileSiteKey)
    : null;
  const content = () => withFrontmatter(assemble(extra(), fields), body());
  const draftKey = () => `wng-draft:${slug()}`;

  onMount(async () => {
    getWhoami()
      .then(setWho)
      .catch(() => {});
    try {
      const raw = await fetchMarkdown(slug());
      setOriginal(raw);
      if (raw !== props.initialContent) {
        const fresh = splitFrontmatter(raw);
        setBody(fresh.body);
        setFields(fieldsFrom(fresh.data));
        setExtra(extraFrom(fresh.data));
      }
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
  // scaffold rather than blank; a restored draft still wins over this.
  function seedTemplate() {
    if (isServer) return;
    const id = new URLSearchParams(window.location.search).get("template");
    if (!id) return;
    const seeded = splitFrontmatter(templateById(id).build(prettify(slug())));
    setBody(seeded.body);
    setFields(fieldsFrom(seeded.data));
    setExtra(extraFrom(seeded.data));
  }

  // Survive a reload: persist the in-progress edit per slug, restore it on mount
  // (over the freshly fetched content), and clear it once the edit is submitted.
  function restoreDraft() {
    const saved = localStorage.getItem(draftKey());
    if (!saved) return;
    try {
      const d = JSON.parse(saved) as { content?: string; summary?: string };
      if (!d.content || d.content === content()) return;
      const s = splitFrontmatter(d.content);
      setBody(s.body);
      setFields(fieldsFrom(s.data));
      setExtra(extraFrom(s.data));
      if (d.summary) setSummary(d.summary);
      setRestored(true);
    } catch {
      localStorage.removeItem(draftKey());
    }
  }

  createEffect(() => {
    const c = content();
    const s = summary();
    if (isServer || !ready()) return;
    if (c === original() && !s.trim()) localStorage.removeItem(draftKey());
    else localStorage.setItem(draftKey(), JSON.stringify({ content: c, summary: s }));
  });

  // Deep-link from a heading's `[edit]`: select that section and seed a summary.
  function focusSection() {
    if (isServer || !ta) return;
    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) return;
    const lines = body().split("\n");
    let offset = 0;
    let start = -1;
    let end = body().length;
    let heading = "";
    for (const line of lines) {
      const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
      if (m) {
        if (start === -1 && slugifyHeading(m[1]) === section) {
          start = offset;
          heading = m[1];
        } else if (start !== -1) {
          end = offset;
          break;
        }
      }
      offset += line.length + 1;
    }
    if (start === -1) return;
    if (!summary().trim()) setSummary(`Edit ${heading} section`);
    ta.focus();
    ta.setSelectionRange(start, end);
    ta.scrollTop = (start / Math.max(1, body().length)) * ta.scrollHeight;
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
    setError();
    setModal(true);
  }
  async function confirmSubmit() {
    setBusy(true);
    setError();
    // Close the confirm dialog first so an in-panel bot-check (if Cloudflare
    // asks for one) is reachable rather than behind the modal backdrop.
    setModal(false);
    try {
      const tok = turnstile ? await turnstile.getToken() : undefined;
      setResult(await submitEdit(slug(), content(), tok, summary()));
      localStorage.removeItem(draftKey());
    } catch (e) {
      setError(errMessage(e));
      turnstile?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div class="view-head">
        <h2>
          {isNew() ? "Creating" : "Editing"} “{prettify(slug())}”
        </h2>
        <p>
          Anyone can edit — no account needed. Trusted edits publish immediately; others
          are submitted for review and go live once a maintainer approves.
        </p>
      </div>

      <PageProperties
        fields={fields}
        setField={(k, v) => setFields(k, v)}
        tier={who()?.tier}
      />

      <div class="editor-shell">
        <div class="editor-pane">
          <div class="pane-bar">
            <span class="pane-name">Markdown</span>
            <div class="md-toolbar">
              <button
                type="button"
                class="md-btn"
                title="Bold"
                aria-label="Bold"
                onClick={() => wrap("**")}
              >
                <Icons.Bold />
              </button>
              <button
                type="button"
                class="md-btn"
                title="Italic"
                aria-label="Italic"
                onClick={() => wrap("_")}
              >
                <Icons.Italic />
              </button>
              <span class="md-sep" />
              <button
                type="button"
                class="md-btn"
                title="Heading"
                aria-label="Heading"
                onClick={() => prefixLine("## ")}
              >
                <Icons.H2 />
              </button>
              <button
                type="button"
                class="md-btn"
                title="List"
                aria-label="List"
                onClick={() => prefixLine("- ")}
              >
                <Icons.List />
              </button>
              <button
                type="button"
                class="md-btn"
                title="Quote"
                aria-label="Quote"
                onClick={() => prefixLine("> ")}
              >
                <Icons.Quote />
              </button>
              <span class="md-sep" />
              <button
                type="button"
                class="md-btn"
                title="Wiki link"
                aria-label="Insert wiki link"
                style={{ "font-family": "var(--font-mono)" }}
                onClick={() => wrap("[[", "]]")}
              >
                [[ ]]
              </button>
              <button
                type="button"
                class="md-btn"
                title="Code"
                aria-label="Code"
                onClick={() => wrap("`")}
              >
                <Icons.Code />
              </button>
            </div>
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
            <div class="editor-widget" ref={(el) => turnstile?.mount(el)} />
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
          <Show when={error()}>
            <p class="editor-err">{error()}</p>
          </Show>
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
        <div class="overlay">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-head">
              <div>
                <p class="mh-title">Submit this change</p>
                <p class="mh-sub">
                  Depending on your trust level and the page, this either publishes
                  immediately or is submitted for review.
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
                  {original().length} → {content().length} chars (
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
                {busy() ? "Submitting…" : "Submit change"}
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
