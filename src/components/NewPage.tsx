import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { BASE, prettify, readHref, slugifyPath } from "../lib/paths";
import { getSearchDocs } from "../lib/search";
import { PAGE_TEMPLATES } from "../lib/templates";
import DraftList from "./DraftList";
import { ViewHead } from "./ui";

function param(name: string) {
  if (isServer) return "";
  return new URLSearchParams(location.search).get(name) ?? "";
}

export default function NewPage() {
  const [title, setTitle] = createSignal(param("title"));
  const [template, setTemplate] = createSignal(PAGE_TEMPLATES[0].id);
  // Set when arriving from the language switcher's "translate this page": the new
  // page joins that translation group, and we collect a language code to prefix
  // the slug (the switcher never pre-picks a language — W5).
  const translationKey = param("translationKey");
  const [lang, setLang] = createSignal("");
  const [existing] = createResource(async () => {
    const docs = await getSearchDocs();
    return new Set(docs.map((d) => d.slug));
  });

  const slug = createMemo(() => {
    const base = slugifyPath(title());
    const l = slugifyPath(lang());
    return translationKey && l && base ? `${l}/${base}` : base;
  });
  const taken = createMemo(() => Boolean(slug()) && existing()?.has(slug()));
  const createHref = () => {
    const q = new URLSearchParams({ template: template() });
    if (translationKey) q.set("translationKey", translationKey);
    return `${BASE}/edit/${slug()}?${q}`;
  };

  const incomplete = () =>
    !slug() || Boolean(taken()) || (Boolean(translationKey) && !lang());

  function create(e: Event) {
    e.preventDefault();
    if (incomplete()) return;
    location.assign(createHref());
  }

  return (
    <div class="new-page">
      <ViewHead
        title={translationKey ? "Translate this page" : "Create a new page"}
        sub={
          translationKey
            ? "Enter the language and a title. The new page joins this article's translation group, and you can edit it like any other."
            : "Pick a title and a starting point. You can rename or restructure the page at any time — nothing is final until you publish."
        }
      />

      <form class="new-form" onSubmit={create}>
        <Show when={translationKey}>
          <label class="field-label">
            Language code
            <input
              class="input"
              value={lang()}
              placeholder="e.g. de, es, ja"
              autofocus
              onInput={(e) => setLang(e.currentTarget.value)}
            />
          </label>
        </Show>
        <label class="field-label">
          Page title
          <input
            class="input"
            value={title()}
            placeholder="e.g. Quantum widgets"
            autofocus={!translationKey}
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
          <button type="submit" class="btn btn-primary" disabled={incomplete()}>
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
