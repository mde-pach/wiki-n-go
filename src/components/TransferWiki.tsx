import { createSignal, Show } from "solid-js";
import { config } from "../config";
import { appInstallUrl } from "../lib/setup-status";
import { subdomainLabel } from "../lib/tenant";
import { finishTransfer, startTransfer } from "../lib/transfer";
import { errMessage } from "../lib/util";
import { ErrorNote } from "./ui";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

// "The Quick lane is never a trap": hand a managed wiki to the owner's own GitHub.
// Step 1 starts the GitHub transfer; the owner accepts on github.com + installs
// the app; step 2 re-points the subdomain to the moved repo so editing resumes.
export default function TransferWiki() {
  const name = subdomainLabel(location.host, config.platformHost) || "";
  const [target, setTarget] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();

  const valid = () => OWNER_RE.test(target().trim());

  async function start() {
    setBusy(true);
    setErr();
    try {
      await startTransfer(name, target().trim());
      setPending(true);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setErr();
    try {
      const r = await finishTransfer(name, target().trim());
      location.assign(r.url);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="settings-transfer">
      <h3>Move to your own GitHub</h3>
      <p class="settings-transfer-sub">
        Hand this hosted wiki to your own GitHub account. Your content, history and{" "}
        <code>
          {name}.{config.platformHost}
        </code>{" "}
        address all stay — you just own the repository. This is never a one-way trap.
      </p>

      <label class="settings-field settings-wide">
        <span>Your GitHub username</span>
        <input
          class="input"
          value={target()}
          placeholder="alice"
          autocomplete="off"
          disabled={pending()}
          onInput={(e) => setTarget(e.currentTarget.value)}
        />
      </label>

      <Show
        when={pending()}
        fallback={
          <div class="settings-actions">
            <button
              type="button"
              class="btn btn-primary"
              disabled={!valid() || busy()}
              onClick={start}
            >
              {busy() ? "Starting…" : "Start the move"}
            </button>
          </div>
        }
      >
        <ol class="settings-transfer-steps">
          <li>
            Accept the transfer to <code>{target().trim()}</code> — GitHub emailed you a
            confirmation link (also under your GitHub notifications).
          </li>
          <li>
            <Show
              when={appInstallUrl()}
              fallback={<>Install the Wikigit app on the moved repository.</>}
            >
              {(href) => (
                <>
                  <a href={href()} target="_blank" rel="noreferrer">
                    Install the Wikigit app
                  </a>{" "}
                  on the moved repository so it can save edits.
                </>
              )}
            </Show>
          </li>
          <li>Then finish the move below to point the address at your repo.</li>
        </ol>
        <div class="settings-actions">
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy()}
            onClick={finish}
          >
            {busy() ? "Finishing…" : "I've accepted & installed — finish move"}
          </button>
        </div>
      </Show>
      <ErrorNote msg={err()} />
    </section>
  );
}
