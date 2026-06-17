import { createSignal, For, Show } from "solid-js";
import { setProtection } from "../lib/admin";
import { useFormAction } from "../lib/solid";
import { ErrorNote, ViewHead } from "./ui";

const TIERS = ["default", "open", "auto", "extended", "maintainer"];

export default function Protection() {
  const [slug, setSlug] = createSignal("");
  const [tier, setTier] = createSignal("maintainer");
  const [done, setDone] = createSignal<string>();
  const { busy, error, run } = useFormAction();

  async function submit(e: Event) {
    e.preventDefault();
    const s = slug()
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!s) return;
    setDone();
    await run(async () => {
      await setProtection(s, tier());
      setDone(`Set protection of ${s} to ${tier()}.`);
    });
  }

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title="Page protection"
        sub="Set the edit tier required for a page — writes its protection frontmatter field."
      />

      <form class="ban-form" onSubmit={submit}>
        <input
          class="ban-input"
          aria-label="Page slug to protect"
          placeholder="page slug, e.g. docs/install"
          value={slug()}
          onInput={(e) => setSlug(e.currentTarget.value)}
        />
        <select
          class="ban-input"
          value={tier()}
          onChange={(e) => setTier(e.currentTarget.value)}
        >
          <For each={TIERS}>{(t) => <option value={t}>{t}</option>}</For>
        </select>
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={busy() || !slug().trim()}
        >
          Apply
        </button>
      </form>

      <ErrorNote msg={error()} />
      <Show when={done()}>
        <p class="protect-done">{done()}</p>
      </Show>
      <p class="protect-note">
        Tiers rank open · auto · extended · maintainer; an editor at or above a page's
        tier may publish to it directly. “default” clears the field, reverting to the
        site default.
      </p>
    </main>
  );
}
