// Helpers for the /setup wizard's GitHub App manifest flow. The flow is 100%
// client-side: GitHub's app-manifests conversions endpoint sends
// `access-control-allow-origin: *`, so the browser creates the app and retrieves
// its private key with no setup-time backend. See SPEC §5.

export interface AppManifest {
  name: string;
  url: string;
  redirect_url: string;
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
  hook_attributes: { url: string; active: boolean };
}

// Exactly the write scopes the Worker uses: commits/PRs for edits, discussions
// for talk. Nothing read-private, no webhooks.
export const APP_PERMISSIONS: Record<string, string> = {
  contents: "write",
  pull_requests: "write",
  discussions: "write",
};

export function buildManifest(opts: {
  owner: string;
  repo: string;
  redirectUrl: string;
  siteUrl: string;
}): AppManifest {
  return {
    name: `${opts.repo}-wiki`,
    url: opts.siteUrl,
    redirect_url: opts.redirectUrl,
    public: false,
    default_permissions: APP_PERMISSIONS,
    default_events: [],
    hook_attributes: { url: opts.siteUrl, active: false },
  };
}

// Where the manifest form POSTs. A repo owned by an org registers the app under
// that org; otherwise under the signed-in user's account.
export function manifestActionUrl(opts: { isOrg: boolean; owner: string }): string {
  return opts.isOrg
    ? `https://github.com/organizations/${opts.owner}/settings/apps/new`
    : "https://github.com/settings/apps/new";
}

export interface AppCredentials {
  id: number;
  slug: string;
  pem: string;
  html_url: string;
  client_id?: string;
}

// Exchange the one-time manifest code for the app's id + private key. Valid for
// one hour, single use.
export async function convertManifestCode(code: string): Promise<AppCredentials> {
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "This setup link expired (codes last one hour). Start over."
        : `GitHub returned ${res.status} converting the app.`,
    );
  }
  return (await res.json()) as AppCredentials;
}

// A url-safe random secret for HASH_SECRET, generated in the browser so it never
// touches a server.
export function randomSecret(bytes = 48): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// One-click Worker deploy from the fork's `worker/` subdirectory: Cloudflare
// clones it, provisions the KV namespace, and prompts for the secrets.
export function cloudflareDeployUrl(opts: {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
}): string {
  const tree = `https://github.com/${opts.owner}/${opts.repo}/tree/${opts.branch}/${
    opts.path ?? "worker"
  }`;
  return `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(tree)}`;
}

export function installUrl(htmlUrl: string): string {
  return `${htmlUrl}/installations/new`;
}

const settingsBase = (owner: string, repo: string) =>
  `https://github.com/${owner}/${repo}/settings`;

export function newSecretUrl(owner: string, repo: string): string {
  return `${settingsBase(owner, repo)}/secrets/actions/new`;
}

export function newVariableUrl(owner: string, repo: string): string {
  return `${settingsBase(owner, repo)}/variables/actions/new`;
}
