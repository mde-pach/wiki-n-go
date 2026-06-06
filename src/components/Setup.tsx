import { createMemo, createResource, createSignal, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { config } from "../config";
import {
  type AppCredentials,
  buildManifest,
  cloudflareDeployUrl,
  convertManifestCode,
  installUrl,
  manifestActionUrl,
  newSecretUrl,
  newVariableUrl,
  randomSecret,
} from "../lib/setup";
import { ViewHead } from "./ui";

const STASH_KEY = "wiki-setup";

interface Stash {
  owner: string;
  repo: string;
  state: string;
}

function readStash(): Stash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    return raw ? (JSON.parse(raw) as Stash) : null;
  } catch {
    return null;
  }
}

function codeFromUrl(): { code: string; state: string } | null {
  if (isServer) return null;
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  return code ? { code, state: q.get("state") ?? "" } : null;
}

function CopyField(props: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = createSignal(false);
  async function copy() {
    await navigator.clipboard.writeText(props.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div class="setup-field">
      <div class="setup-field-head">
        <span class="field-label">{props.label}</span>
        <button type="button" class="btn btn-ghost btn-sm" onClick={copy}>
          {copied() ? "Copied" : "Copy"}
        </button>
      </div>
      <Show
        when={props.multiline}
        fallback={<code class="setup-value mono">{props.value}</code>}
      >
        <textarea class="setup-value mono" readonly rows={6}>
          {props.value}
        </textarea>
      </Show>
    </div>
  );
}

export default function Setup() {
  const back = codeFromUrl();
  const [owner, setOwner] = createSignal(readStash()?.owner ?? config.repoOwner);
  const [repo, setRepo] = createSignal(readStash()?.repo ?? config.repoName);
  const [isOrg, setIsOrg] = createSignal(false);
  const hashSecret = randomSecret();

  // If we returned from GitHub with a code, exchange it for the app credentials.
  const [creds] = createResource<AppCredentials | null>(async () => {
    if (!back) return null;
    return convertManifestCode(back.code);
  });

  const redirectUrl = isServer ? "" : location.origin + location.pathname;
  const siteUrl = isServer
    ? ""
    : `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/`;

  const manifestJson = createMemo(() =>
    JSON.stringify(
      buildManifest({ owner: owner(), repo: repo(), redirectUrl, siteUrl }),
    ),
  );
  const state = randomSecret(12);
  const action = createMemo(
    () => `${manifestActionUrl({ isOrg: isOrg(), owner: owner() })}?state=${state}`,
  );

  function stash() {
    sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({ owner: owner(), repo: repo(), state }),
    );
  }

  const deployUrl = () =>
    cloudflareDeployUrl({ owner: owner(), repo: repo(), branch: config.branch });

  return (
    <div class="setup">
      <Show
        when={back}
        fallback={
          <ConfigStep
            owner={owner()}
            repo={repo()}
            isOrg={isOrg()}
            setOwner={setOwner}
            setRepo={setRepo}
            setIsOrg={setIsOrg}
            action={action()}
            manifestJson={manifestJson()}
            onSubmit={stash}
          />
        }
      >
        <ViewHead title="Finish setting up your wiki bot" />
        <Show when={creds.loading}>
          <p class="wiki-status">Retrieving your app's credentials from GitHub…</p>
        </Show>
        <Show when={creds.error as Error | undefined}>
          {(err) => (
            <div class="setup-card">
              <p class="editor-err">{err().message}</p>
              <a class="btn btn-primary" href={redirectUrl}>
                Start over
              </a>
            </div>
          )}
        </Show>
        <Show when={creds.state === "ready" && creds()}>
          {(c) => (
            <CredentialsStep
              creds={c()}
              owner={owner()}
              repo={repo()}
              hashSecret={hashSecret}
              deployUrl={deployUrl()}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}

function ConfigStep(props: {
  owner: string;
  repo: string;
  isOrg: boolean;
  setOwner: (v: string) => void;
  setRepo: (v: string) => void;
  setIsOrg: (v: boolean) => void;
  action: string;
  manifestJson: string;
  onSubmit: () => void;
}) {
  return (
    <>
      <ViewHead
        title="Set up your wiki"
        sub="This creates a private GitHub App — the bot that turns in-site edits into commits. No personal access token, no copy-pasting credentials by hand. Takes about two minutes."
      />
      <form
        class="new-form"
        method="post"
        action={props.action}
        onSubmit={props.onSubmit}
      >
        <input type="hidden" name="manifest" value={props.manifestJson} />
        <label class="field-label">
          Repository owner
          <input
            class="input"
            value={props.owner}
            onInput={(e) => props.setOwner(e.currentTarget.value)}
          />
        </label>
        <label class="field-label">
          Repository name
          <input
            class="input"
            value={props.repo}
            onInput={(e) => props.setRepo(e.currentTarget.value)}
          />
        </label>
        <label class="setup-check">
          <input
            type="checkbox"
            checked={props.isOrg}
            onChange={(e) => props.setIsOrg(e.currentTarget.checked)}
          />
          This repository is owned by an organization
        </label>
        <p class="field-hint">
          You'll land on GitHub's “Create GitHub App” page with everything pre-filled —
          just review and confirm. The app asks only for what the wiki needs: write
          access to code, pull requests, and discussions.
        </p>
        <div class="editor-actions">
          <button type="submit" class="btn btn-primary">
            Create the wiki bot on GitHub →
          </button>
        </div>
      </form>
    </>
  );
}

function CredentialsStep(props: {
  creds: AppCredentials;
  owner: string;
  repo: string;
  hashSecret: string;
  deployUrl: string;
}) {
  return (
    <div class="setup-steps">
      <p class="setup-lede">
        Your app <strong>{props.creds.slug}</strong> is created. Three things left —
        keep this tab open, the private key is shown only once.
      </p>

      <section class="setup-card">
        <h3 class="setup-step-title">1 · Save these three values</h3>
        <p class="setup-step-sub">
          You'll paste them in the next step. The private key never leaves this page
          until you do.
        </p>
        <CopyField label="GITHUB_APP_ID" value={String(props.creds.id)} />
        <CopyField label="GITHUB_APP_PRIVATE_KEY" value={props.creds.pem} multiline />
        <CopyField label="HASH_SECRET (freshly generated)" value={props.hashSecret} />
        <a
          class="btn btn-ghost btn-sm"
          href={`data:application/x-pem-file;base64,${btoa(props.creds.pem)}`}
          download={`${props.creds.slug}.private-key.pem`}
        >
          Download key as .pem
        </a>
      </section>

      <section class="setup-card">
        <h3 class="setup-step-title">2 · Deploy the Worker</h3>
        <p class="setup-step-sub">
          One click. Cloudflare clones your <code class="mono">worker/</code> folder,
          creates the KV namespace, and asks for the three values above plus your repo
          identity.
        </p>
        <a
          class="btn btn-primary"
          href={props.deployUrl}
          target="_blank"
          rel="noopener"
        >
          Deploy to Cloudflare →
        </a>
        <p class="field-hint">
          In Cloudflare's deploy screen, set these as variables / secrets:
          <code class="mono">GITHUB_APP_ID</code>,{" "}
          <code class="mono">GITHUB_APP_PRIVATE_KEY</code>,{" "}
          <code class="mono">HASH_SECRET</code>,{" "}
          <code class="mono">REPO_OWNER={props.owner}</code>,{" "}
          <code class="mono">REPO_NAME={props.repo}</code>. Copy the deployed{" "}
          <code class="mono">*.workers.dev</code> URL — you'll need it in step 3.
        </p>
        <details class="setup-alt">
          <summary>Prefer GitHub Actions instead of the button?</summary>
          <p class="field-hint">
            Add repo variable <code class="mono">GH_APP_ID</code> and secret{" "}
            <code class="mono">GH_APP_PRIVATE_KEY</code>, plus{" "}
            <code class="mono">CLOUDFLARE_API_TOKEN</code> +{" "}
            <code class="mono">CLOUDFLARE_ACCOUNT_ID</code>, then run the Deploy Worker
            workflow.
          </p>
          <p class="setup-links">
            <a
              href={newVariableUrl(props.owner, props.repo)}
              target="_blank"
              rel="noopener"
            >
              Add a repo variable →
            </a>
            <a
              href={newSecretUrl(props.owner, props.repo)}
              target="_blank"
              rel="noopener"
            >
              Add a repo secret →
            </a>
          </p>
        </details>
      </section>

      <section class="setup-card">
        <h3 class="setup-step-title">3 · Install the app + point the site at it</h3>
        <p class="setup-step-sub">
          Install grants the bot write access to your repo. Then set the site's{" "}
          <code class="mono">WORKER_URL</code> repo variable to the URL from step 2 and
          redeploy Pages.
        </p>
        <p class="setup-links">
          <a
            class="btn btn-primary"
            href={installUrl(props.creds.html_url)}
            target="_blank"
            rel="noopener"
          >
            Install the app on {props.owner}/{props.repo} →
          </a>
          <a
            href={newVariableUrl(props.owner, props.repo)}
            target="_blank"
            rel="noopener"
          >
            Set WORKER_URL →
          </a>
        </p>
      </section>

      <p class="setup-done">
        That's it — anonymous in-site editing now works on your wiki, with no token to
        rotate.
      </p>
    </div>
  );
}
