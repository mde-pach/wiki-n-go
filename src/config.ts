// Repo holding the Markdown content (this repo works once pushed to GitHub).
export const config = {
  repoOwner: "mde-pach",
  repoName: "wiki-n-go",
  branch: "main",
  contentDir: "content",
  homeSlug: "index",
  workerUrl: "https://wiki-n-go.maxime-depachtere-80f.workers.dev",
  turnstileSiteKey: "0x4AAAAAADe7QjsOFAA6Fc8O",
  // Flip to true once a GitHub OAuth App is created and the Worker has
  // OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET / SESSION_SECRET set (see README).
  oauthEnabled: false,
};
