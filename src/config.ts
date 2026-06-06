// Site config. Each value is injected at build time from a PUBLIC_* env var
// (set by the GitHub Pages workflow from repo context / repo variables) and
// falls back to the literal here, so a fork builds correctly with no edits and
// a local build behaves exactly as before.
const env = import.meta.env;

export const config = {
  repoOwner: env.PUBLIC_REPO_OWNER ?? "mde-pach",
  repoName: env.PUBLIC_REPO_NAME ?? "wiki-n-go",
  branch: "main",
  contentDir: "content",
  homeSlug: "index",
  workerUrl:
    env.PUBLIC_WORKER_URL ?? "https://wiki-n-go.maxime-depachtere-80f.workers.dev",
  turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAADe7QjsOFAA6Fc8O",
  // Enabled once a GitHub OAuth App is wired (Worker has OAUTH_CLIENT_ID /
  // OAUTH_CLIENT_SECRET / SESSION_SECRET); set repo var OAUTH_ENABLED=true.
  oauthEnabled: env.PUBLIC_OAUTH_ENABLED === "true",
};
