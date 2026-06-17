import { createSignal, Show } from "solid-js";
import { useSubmit } from "../../lib/solid";
import { ErrorNote } from "../ui";

export function Composer(props: {
  submitLabel: string;
  placeholder?: string;
  withTitle?: boolean;
  onSubmit: (text: string, token: string | undefined, title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = createSignal("");
  const [draft, setDraft] = createSignal("");
  const { busy, error, setError, run } = useSubmit();

  function submit() {
    if (props.withTitle && !title().trim()) {
      setError("Give the topic a title.");
      return;
    }
    if (!draft().trim()) return;
    // Verify under the hood — no visible bot-check widget.
    run((tok) => props.onSubmit(draft(), tok, title().trim()));
  }

  return (
    <div class="composer">
      <Show when={props.withTitle}>
        <input
          class="input"
          placeholder="Topic title"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </Show>
      <textarea
        class="comment-input"
        rows={3}
        placeholder={props.placeholder ?? "Add to the discussion…"}
        prop:value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
      />
      <div class="editor-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={busy() || !draft().trim()}
          onClick={submit}
        >
          {busy() ? "Posting…" : props.submitLabel}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
      <ErrorNote msg={error()} />
    </div>
  );
}
