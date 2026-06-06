import { createSignal, Show } from "solid-js";
import { type CiteResult, lookupCitation } from "../lib/cite";
import { errMessage } from "../lib/util";

const KIND_LABEL: Record<CiteResult["citation"]["kind"], string> = {
  doi: "DOI",
  isbn: "ISBN",
  url: "Web page",
};

export default function Cite() {
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [result, setResult] = createSignal<CiteResult>();
  const [copied, setCopied] = createSignal(false);

  async function submit(e: Event) {
    e.preventDefault();
    const q = query().trim();
    if (!q) return;
    setErr();
    setResult();
    setBusy(true);
    try {
      setResult(await lookupCitation(q));
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const md = result()?.markdown;
    if (!md) return;
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div class="cite-tool">
      <div class="view-head">
        <h2>Cite a source</h2>
        <p>
          Paste a <strong>URL</strong>, <strong>DOI</strong>, or <strong>ISBN</strong>{" "}
          to build a footnote. Copy the result into a page as a Markdown reference.
        </p>
      </div>

      <form class="cite-form" onSubmit={submit}>
        <input
          class="input"
          value={query()}
          placeholder="https://… · 10.1038/… · 978-0-13-468599-1"
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <button type="submit" class="btn btn-primary" disabled={busy()}>
          {busy() ? "Looking up…" : "Look up"}
        </button>
      </form>

      <Show when={err()}>
        <p class="editor-err">{err()}</p>
      </Show>

      <Show when={result()}>
        {(r) => (
          <div class="cite-result">
            <div class="cite-meta">
              <span class="cite-kind">{KIND_LABEL[r().citation.kind]}</span>
              <h3>{r().citation.title}</h3>
              <Show when={r().citation.authors.length}>
                <p class="cite-authors">{r().citation.authors.join(", ")}</p>
              </Show>
              <p class="cite-source">
                <Show when={r().citation.container}>
                  <span>{r().citation.container}</span>
                </Show>
                <Show when={r().citation.year}>
                  <span>{r().citation.year}</span>
                </Show>
              </p>
            </div>
            <div class="field-label">
              <span>Markdown footnote</span>
              <code class="cite-markdown">{r().markdown}</code>
            </div>
            <div class="editor-actions">
              <button type="button" class="btn btn-primary" onClick={copy}>
                {copied() ? "Copied" : "Copy Markdown"}
              </button>
              <a
                class="btn btn-ghost"
                href={r().citation.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
