import { createSignal, For, onMount, Show } from "solid-js";
import { config } from "../config";
import { type Comment, listComments, postComment } from "../lib/comments";
import { slugFromLocation } from "../lib/slug";
import { renderTurnstile, resetTurnstile } from "../lib/turnstile";
import { errMessage } from "../lib/util";

export default function Discussion(props: { slug?: string }) {
  if (!config.workerUrl) return null;

  const slug = () => props.slug ?? slugFromLocation();
  const [comments, setComments] = createSignal<Comment[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [token, setToken] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  let widgetId: string | undefined;

  async function load() {
    try {
      setComments(await listComments(slug()));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoaded(true);
    }
  }
  onMount(load);

  function mountWidget(el: HTMLDivElement) {
    if (!config.turnstileSiteKey) return;
    renderTurnstile(el, config.turnstileSiteKey, setToken)
      .then((id) => {
        widgetId = id;
      })
      .catch((e) => setError(errMessage(e)));
  }

  async function send() {
    if (!draft().trim()) return;
    if (config.turnstileSiteKey && !token()) {
      setError("Please complete the bot check.");
      return;
    }
    setBusy(true);
    setError();
    try {
      await postComment(slug(), draft(), token());
      setDraft("");
      setToken(undefined);
      resetTurnstile(widgetId);
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="discussion">
      <h2 class="discussion-title">Discussion</h2>
      <Show when={loaded()} fallback={<CommentSkeleton />}>
        <Show when={comments().length === 0}>
          <p class="wiki-status">No comments yet — start the discussion.</p>
        </Show>
        <ul class="comment-list">
          <For each={comments()}>
            {(c) => (
              <li class="comment">
                <div class="comment-meta">
                  <Show when={c.avatarUrl}>
                    <img class="comment-avatar" src={c.avatarUrl ?? ""} alt="" />
                  </Show>
                  <span class="comment-author" classList={{ anon: c.isAnon }}>
                    {c.author}
                  </span>
                  <span class="comment-date">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div class="comment-body" innerHTML={c.bodyHtml} />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <textarea
        class="comment-input"
        rows={3}
        placeholder="Add to the discussion…"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
      />
      <div class="editor-widget" ref={mountWidget} />
      <div class="editor-actions">
        <button type="button" class="btn btn-primary" disabled={busy()} onClick={send}>
          {busy() ? "Posting…" : "Post comment"}
        </button>
      </div>
      <Show when={error()}>
        <p class="editor-err">{error()}</p>
      </Show>
    </section>
  );
}

function CommentSkeleton() {
  return (
    <ul class="comment-list" aria-hidden="true">
      <For each={[0, 1]}>
        {() => (
          <li class="comment">
            <span
              class="sk-bar skeleton"
              style={{ width: "8rem", height: "0.85rem" }}
            />
            <div
              class="sk-bar skeleton"
              style={{ width: "70%", height: "0.9rem", "margin-top": "0.5rem" }}
            />
          </li>
        )}
      </For>
    </ul>
  );
}
