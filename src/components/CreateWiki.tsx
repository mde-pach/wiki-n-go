import { createSignal, For, onMount, Show } from "solid-js";
import { config } from "../config";
import {
  authProviders,
  authProvidersCached,
  enabledProviders,
  getSession,
  login,
  type Provider,
} from "../lib/auth";
import { type Availability, checkName, createWiki } from "../lib/claim";
import { appInstallUrl, templateGenerateUrl } from "../lib/setup-status";
import { errMessage } from "../lib/util";
import { ErrorNote, Status, ViewHead } from "./ui";

type Lane = "platform" | "byo";
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

// Email (Wikigit account) lets a non-technical owner create a managed wiki
// without a GitHub account — the platform lane provisions the repo for them.
const PROVIDER_LABEL: Record<Provider, string> = {
  github: "Continue with GitHub",
  wikigit: "Continue with email",
};

export default function CreateWiki() {
  const [signedIn] = createSignal(Boolean(getSession()));
  const [providers, setProviders] = createSignal(authProvidersCached());
  onMount(async () => setProviders(await authProviders()));
  const [name, setName] = createSignal("");
  const [avail, setAvail] = createSignal<Availability>();
  const [lane, setLane] = createSignal<Lane>("platform");
  const [repo, setRepo] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onName(v: string) {
    const value = v.toLowerCase();
    setName(value);
    setAvail(undefined);
    setErr();
    clearTimeout(timer);
    if (!NAME_RE.test(value)) return;
    timer = setTimeout(async () => {
      try {
        setAvail(await checkName(value));
      } catch {
        // leave unknown; the server re-validates on submit
      }
    }, 350);
  }

  const ready = () =>
    NAME_RE.test(name()) &&
    avail()?.available === true &&
    (lane() === "platform" || /^[\w.-]+\/[\w.-]+$/.test(repo()));

  async function submit() {
    setBusy(true);
    setErr();
    try {
      const res = await createWiki({
        name: name(),
        lane: lane(),
        repo: lane() === "byo" ? repo() : undefined,
      });
      window.location.assign(res.url);
    } catch (e) {
      setErr(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <main id="main" class="view-wrap settings-page">
      <ViewHead
        title="Create your wiki"
        sub="Pick a name and you're live in seconds — hosted for you, or backed by your own GitHub repo."
      />

      <Show
        when={signedIn()}
        fallback={
          <div class="create-signin">
            <Status>Sign in to create a wiki — it takes a second.</Status>
            <div class="provider-list">
              <For each={enabledProviders(providers())}>
                {(p, i) => (
                  <button
                    type="button"
                    class={`btn provider-btn ${i() === 0 ? "btn-primary" : "btn-outline"}`}
                    onClick={() => login(p, location.href)}
                  >
                    {PROVIDER_LABEL[p]}
                  </button>
                )}
              </For>
            </div>
          </div>
        }
      >
        <div class="settings-grid">
          <label class="settings-field settings-wide">
            <span>Wiki address</span>
            <div class="create-name-row">
              <input
                class="input"
                value={name()}
                placeholder="my-wiki"
                autocomplete="off"
                onInput={(e) => onName(e.currentTarget.value)}
              />
              <span class="create-suffix">.{config.platformHost}</span>
            </div>
            <Show when={name() && !NAME_RE.test(name())}>
              <span class="create-hint is-bad">
                Use 1–40 lowercase letters, numbers, or hyphens.
              </span>
            </Show>
            <Show when={avail()}>
              {(a) => (
                <span class={`create-hint ${a().available ? "is-ok" : "is-bad"}`}>
                  {a().available
                    ? `${name()}.${config.platformHost} is available ✓`
                    : a().reason === "taken"
                      ? "That name is taken."
                      : a().reason === "reserved"
                        ? "That name is reserved."
                        : "Invalid name."}
                </span>
              )}
            </Show>
          </label>

          <fieldset class="settings-field settings-wide create-lanes">
            <span>Where should your content live?</span>
            <label class="create-lane">
              <input
                type="radio"
                name="lane"
                checked={lane() === "platform"}
                onChange={() => setLane("platform")}
              />
              <div>
                <strong>Host it for me</strong> — we keep your content in a repo for
                you. No GitHub account needed. Easiest.
              </div>
            </label>
            <label class="create-lane">
              <input
                type="radio"
                name="lane"
                checked={lane() === "byo"}
                onChange={() => setLane("byo")}
              />
              <div>
                <strong>Use my own GitHub repo</strong> — you own the content. Install
                the app on your repo first, then enter it below.
              </div>
            </label>
          </fieldset>

          <Show when={lane() === "byo"}>
            <label class="settings-field settings-wide">
              <span>Your repository (owner/repo)</span>
              <input
                class="input"
                value={repo()}
                placeholder="alice/my-wiki"
                autocomplete="off"
                onInput={(e) => setRepo(e.currentTarget.value)}
              />
              <Show when={templateGenerateUrl()}>
                {(href) => (
                  <span class="create-hint">
                    No repo yet?{" "}
                    <a href={href()} target="_blank" rel="noreferrer">
                      Create one from our template
                    </a>{" "}
                    — a ready wiki with the reader and publishing set up. Then enter it
                    above.
                  </span>
                )}
              </Show>
              <Show when={appInstallUrl()}>
                {(href) => (
                  <span class="create-hint">
                    Not installed yet?{" "}
                    <a href={href()} target="_blank" rel="noreferrer">
                      Install the Wikigit app on your repo
                    </a>
                    .
                  </span>
                )}
              </Show>
            </label>
          </Show>
        </div>

        <div class="settings-actions">
          <button
            type="button"
            class="btn btn-primary"
            disabled={!ready() || busy()}
            onClick={submit}
          >
            {busy() ? "Creating…" : "Create my wiki"}
          </button>
        </div>
        <ErrorNote msg={err()} />
      </Show>
    </main>
  );
}
