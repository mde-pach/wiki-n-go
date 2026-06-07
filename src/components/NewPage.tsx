import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { BASE, prettify, readHref, slugifyPath } from "../lib/paths";
import { getSearchDocs } from "../lib/search";
import { PAGE_TEMPLATES } from "../lib/templates";
import DraftList from "./DraftList";
import { ViewHead } from "./ui";

function initialTitle() {
  if (isServer) return "";
  return new URLSearchParams(location.search).get("title") ?? "";
}

export default function NewPage() {
  const [title, setTitle] = createSignal(initialTitle());
  const [template, setTemplate] = createSignal(PAGE_TEMPLATES[0].id);
  const [existing] = createResource(async () => {
    const docs = await getSearchDocs();
    return new Set(docs.map((d) => d.slug));
  });

  const slug = createMemo(() => slugifyPath(title()));
  const taken = createMemo(() => Boolean(slug()) && existing()?.has(slug()));
  const createHref = () => `${BASE}/edit/${slug()}?template=${template()}`;

  function create(e: Event) {
    e.preventDefault();
    if (!slug() || taken()) return;
    location.assign(createHref());
  }

  return (
    <div class="new-page">
      <ViewHead
        title="Create a new page"
        sub="Pick a title and a starting point. You can rename or restructure the page at any time — nothing is final until you publish."
      />

      <form class="new-form" onSubmit={create}>
        <label class="field-label">
          Page title
          <input
            class="input"
            value={title()}
            placeholder="e.g. Quantum widgets"
            autofocus
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </label>
        <p class="field-hint">
          Address: <span class="mono">{slug() || "…"}</span>
        </p>

        <Show when={taken()}>
          <p class="editor-err">
            A page already exists at <span class="mono">{slug()}</span> —{" "}
            <a href={readHref(slug())}>read it</a> or{" "}
            <a href={`${BASE}/edit/${slug()}`}>edit it</a> instead.
          </p>
        </Show>

        <fieldset class="template-picker">
          <legend class="field-label">Start from</legend>
          <For each={PAGE_TEMPLATES}>
            {(t) => (
              <label
                class={`template-option${template() === t.id ? " is-active" : ""}`}
              >
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={template() === t.id}
                  onChange={() => setTemplate(t.id)}
                />
                <span class="template-text">
                  <span class="template-label">{t.label}</span>
                  <span class="template-desc">{t.description}</span>
                </span>
              </label>
            )}
          </For>
        </fieldset>

        <div class="editor-actions">
          <button
            type="submit"
            class="btn btn-primary"
            disabled={!slug() || Boolean(taken())}
          >
            Create “{prettify(slug() || "")}” →
          </button>
          <a class="btn btn-ghost" href={`${BASE}/`}>
            Cancel
          </a>
        </div>
      </form>

      <DraftList heading="Resume a saved draft" />
    </div>
  );
}
