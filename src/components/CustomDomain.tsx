import { createSignal, Show } from "solid-js";
import { config } from "../config";
import { addCustomDomain } from "../lib/domain";
import { subdomainLabel } from "../lib/tenant";
import { errMessage } from "../lib/util";
import { ErrorNote } from "./ui";

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// Point your own `wiki.mybrand.com` at this wiki. The owner adds a CNAME to their
// tenant's platform host; the Engine verifies it before recording the mapping.
// The certificate is issued by the platform's proxy once DNS is live.
export default function CustomDomain() {
  const name = subdomainLabel(location.host, config.platformHost) || "";
  const target = `${name}.${config.platformHost}`;
  const [domain, setDomain] = createSignal("");
  const [done, setDone] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();

  const valid = () => DOMAIN_RE.test(domain().trim().toLowerCase());

  async function add() {
    setBusy(true);
    setErr();
    try {
      const r = await addCustomDomain(name, domain().trim().toLowerCase());
      setDone(r.url);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="settings-transfer">
      <h3>Custom domain</h3>
      <p class="settings-transfer-sub">
        Serve this wiki at your own address. At your DNS provider, add a{" "}
        <strong>CNAME</strong> record pointing your domain to <code>{target}</code>,
        then verify it below. A secure certificate is issued automatically once DNS is
        live.
      </p>

      <label class="settings-field settings-wide">
        <span>Your domain</span>
        <input
          class="input"
          value={domain()}
          placeholder="wiki.mybrand.com"
          autocomplete="off"
          disabled={Boolean(done())}
          onInput={(e) => setDomain(e.currentTarget.value)}
        />
      </label>

      <Show
        when={done()}
        fallback={
          <div class="settings-actions">
            <button
              type="button"
              class="btn btn-primary"
              disabled={!valid() || busy()}
              onClick={add}
            >
              {busy() ? "Verifying…" : "Verify & add"}
            </button>
          </div>
        }
      >
        {(url) => (
          <p class="settings-saved">
            Added ✓ — your wiki will be live at <code>{url()}</code> shortly (the
            certificate can take a few minutes to provision).
          </p>
        )}
      </Show>
      <ErrorNote msg={err()} />
    </section>
  );
}
