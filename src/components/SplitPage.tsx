import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { fetchMarkdown } from "../lib/content";
import { listSections } from "../lib/editor-section";
import { splitFrontmatter } from "../lib/frontmatter";
import { composeSplit, splitPage } from "../lib/lifecycle";
import { prettify, readHref, slugifyPath } from "../lib/paths";
import { useSubmit } from "../lib/solid";
import { ErrorNote, Status, ViewHead } from "./ui";

export default function SplitPage() {
  const from = isServer ? "" : (new URLSearchParams(location.search).get("page") ?? "");
  const [source] = createResource(
    () => from || undefined,
    (slug) => fetchMarkdown(slug),
  );
  const sections = createMemo(() => {
    const raw = source();
    return raw ? listSections(splitFrontmatter(raw).body) : [];
  });
  const [section, setSection] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [done, setDone] = createSignal<string>();
  const { busy, error, setError, run } = useSubmit();
  const toSlug = createMemo(() => slugifyPath(title()));
  // The chosen section, defaulting to the first once the page loads.
  const chosen = createMemo(() => section() || sections()[0]?.slug || "");

  function submit() {
    const raw = source();
    if (!raw) return setError("The source page hasn't loaded yet.");
    if (!chosen()) return setError("Pick a section to split out.");
    if (!toSlug()) return setError("Enter a name for the new page.");
    if (toSlug() === from) return setError("Pick a different name for the new page.");
    const composed = composeSplit(from, raw, chosen());
    if (!composed) return setError("That section was not found.");
    run(async (tok) => {
      const res = await splitPage(
        from,
        toSlug(),
        composed.fromContent,
        composed.toContent,
        summary() || `Split ${toSlug()} out of ${from}`,
        tok,
      );
      setDone(res.to);
    });
  }

  return (
    <div class="split-page">
      <ViewHead
        title="Split a page"
        sub="Carve a section of this page into a new page of its own. The section is moved over and removed from here."
      />

      <Show
        when={from}
        fallback={
          <Status>No page specified — open this from a page's “Split” link.</Status>
        }
      >
        <Show
          when={done()}
          fallback={
            <Show
              when={sections().length}
              fallback={
                <Status>
                  This page has no <span class="mono">##</span> sections to split out.
                </Status>
              }
            >
              <div class="split-form">
                <label class="field-label">
                  Split from
                  <input class="input mono" value={from} disabled />
                </label>
                <label class="field-label">
                  Section
                  <select
                    class="input"
                    value={chosen()}
                    onChange={(e) => setSection(e.currentTarget.value)}
                  >
                    <For each={sections()}>
                      {(s) => <option value={s.slug}>{s.heading}</option>}
                    </For>
                  </select>
                </label>
                <label class="field-label">
                  New page name
                  <input
                    class="input"
                    value={title()}
                    placeholder="New page title or slug"
                    onInput={(e) => setTitle(e.currentTarget.value)}
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
                    {busy() ? "Splitting…" : "Split section"}
                  </button>
                  <a class="btn btn-ghost" href={readHref(from)}>
                    Cancel
                  </a>
                </div>
                <ErrorNote msg={error()} />
              </div>
            </Show>
          }
        >
          {(to) => (
            <p class="editor-ok">
              Split into <a href={readHref(to())}>{prettify(to())}</a>. The section was
              removed from <span class="mono">{from}</span>.
            </p>
          )}
        </Show>
      </Show>
    </div>
  );
}
