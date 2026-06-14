import type { KV } from "./store";

export interface Env {
  // The write credential. Set GITHUB_TOKEN (bot PAT) OR the GITHUB_APP_* trio;
  // when the App is configured it's preferred and the PAT is unused (see githubApp.ts).
  GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string; // PKCS#8 PEM
  GITHUB_APP_INSTALLATION_ID?: string; // optional; derived from the repo install when unset
  GITHUB_APP_SLUG?: string; // the App's URL slug, for the setup page's one-click install link
  HASH_SECRET: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  BRANCH: string;
  CONTENT_DIR: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT?: KV; // the in-memory (Bun) or KV (legacy CF) store; unset → rate limiting/caches inert
  POW_BITS?: string; // proof-of-work difficulty (leading zero bits) for anon writes; default 18, "0" disables
  // Discussion target. Both IDs are derived at runtime from REPO_OWNER/REPO_NAME
  // + DISCUSSION_CATEGORY (so a fork needs no manual lookup); set them only to
  // override the derivation.
  REPO_ID?: string;
  DISCUSSION_CATEGORY_ID?: string;
  DISCUSSION_CATEGORY?: string; // category name to post talk topics in (default "General")
  // Autonomous-editing knobs (all optional; defaults keep the reviewed-PR model).
  DEFAULT_EDIT_TIER?: string; // tier required to edit a page with no `protection:` frontmatter (default "maintainer")
  AUTOCONFIRM_EDITS?: string; // accepted edits for the "auto" tier (default 10)
  AUTOCONFIRM_DAYS?: string; // age in days for the "auto" tier (default 4)
  EXTENDED_EDITS?: string; // accepted edits for the "extended" tier (default 500)
  EXTENDED_DAYS?: string; // age in days for the "extended" tier (default 30)
  AUTOPATROL_TIER?: string; // min tier whose edits land pre-patrolled (default "extended")
  THREE_RR_MAX?: string; // edits to one page per author per 24h before the edit-war flag (default 3)
  // Automoderator (auto-revert of high-confidence vandalism). Unset → OFF.
  AUTOMOD_REVERT_SCORE?: string; // revert-risk score (0–100) at/above which the bot auto-reverts; unset = disabled
  AUTOMOD_EXEMPT_TIER?: string; // authors at/above this tier are never auto-reverted (default "auto")
  AUTOMOD_REVERT_CAP?: string; // max auto-reverts to one page per 24h before backing off (default 3)
  HOME_SLUG?: string; // slug treated as the home page (excluded from orphans; default "index")
  // Optional GitHub sign-in. Unset → sign-in is disabled and every path stays
  // anonymous. CLIENT_ID is public; CLIENT_SECRET + SESSION_SECRET are secrets.
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  // Optional "Sign in with Wikigit" (M10): our OpenAuth issuer (the accounts/
  // Worker URL). Unset → the Wikigit provider stays disabled. A public client —
  // no secret; both values are public. Reuses SESSION_SECRET for the session.
  WIKIGIT_ISSUER?: string;
  WIKIGIT_CLIENT_ID?: string;
  // Shared hosted instance (giscus model). "1"/"true" → derive the target repo
  // from the request (X-Wiki-Repo header / ?repo=), validate it against the App's
  // installs, and namespace KV per repo. Requires the GitHub App credential.
  // Unset (default) → single-tenant: always env's repo, request repo ignored.
  MULTI_TENANT?: string;
  // The hosted platform's apex (e.g. "wikigit.org"). Used to parse a request
  // host into a tenant label (`foo.wikigit.org` → `foo`) for `/resolve`. Unset →
  // derive the base as the host's registrable two labels (fine for `x.y`; set it
  // explicitly for multi-part TLDs).
  PLATFORM_HOST?: string;
  // Managed-hosting provisioning: a SECOND, operator-only GitHub App
  // (wikigit-platform) with Administration write on PLATFORM_ORG, used solely to
  // create tenant repos. Distinct from the content App above so org-admin never
  // rides on the App users install on their own repos. All three unset → the
  // platform-stored lane is disabled (bring-your-own still works).
  GITHUB_PLATFORM_APP_ID?: string;
  GITHUB_PLATFORM_APP_PRIVATE_KEY?: string;
  PLATFORM_ORG?: string; // the GitHub org that holds managed tenant repos
  // Operator kill-switch: any truthy value (≠ "0"/"false") pauses `POST /claim`
  // with a 503, so provisioning can be halted under abuse without a redeploy of
  // the App credentials. Reads/edits of existing wikis are unaffected.
  PROVISION_PAUSED?: string;
  // Per-identity ceiling on managed (platform-lane) wikis, counted from the
  // registry's `owner`. Unset/invalid → DEFAULT_MAX_WIKIS.
  MAX_WIKIS_PER_OWNER?: string;
  // Write-time email notifications for Wikigit-account (`wg:`) users. The IdP is
  // the only place their address lives, so the Engine POSTs an event here and the
  // IdP resolves the email + sends via the SMTP it already runs (see NOTIFY.md).
  // Unset → email notifications are inert (gh: users are still reached natively
  // by GitHub). `IDP_MAIL_TOKEN` is a shared secret bearer for that endpoint.
  IDP_MAIL_URL?: string;
  IDP_MAIL_TOKEN?: string;
}

export interface EditBody {
  slug?: unknown;
  content?: unknown;
  summary?: unknown;
  token?: unknown;
}

export interface MoveBody {
  from?: unknown;
  to?: unknown;
  summary?: unknown;
  token?: unknown;
}

// Merge folds `from` into `to`: the client sends the already-composed `to`
// content (its body + `from`'s, with `merged_from` frontmatter), and the Worker
// leaves a redirect stub at `from` — like a move whose target already exists.
export interface MergeBody {
  from?: unknown;
  to?: unknown;
  content?: unknown; // composed new content for `to`
  summary?: unknown;
  token?: unknown;
}

// Split carves a section of `from` into a brand-new page `to`: the client sends
// both composed sides (`to` seeded from the section, `from` with it trimmed).
export interface SplitBody {
  from?: unknown;
  to?: unknown;
  fromContent?: unknown; // trimmed source
  toContent?: unknown; // new page seeded from the section
  summary?: unknown;
  token?: unknown;
}

export interface TopicBody {
  slug?: unknown;
  title?: unknown;
  body?: unknown;
  token?: unknown;
}

export interface CommentBody {
  topicId?: unknown;
  replyTo?: unknown;
  body?: unknown;
  token?: unknown;
}

export interface PatrolBody {
  sha?: unknown;
}

export interface TagBody {
  sha?: unknown;
  tag?: unknown;
}

export interface ReviewBody {
  number?: unknown;
  action?: unknown; // "merge" | "close"
}

export interface RollbackBody {
  sha?: unknown;
}

export interface BanBody {
  key?: unknown;
  paths?: unknown;
  reason?: unknown;
  // Optional ISO timestamp or a duration like "24h" / "7d" / "2w" → temp block.
  expires?: unknown;
}

export interface UnbanBody {
  key?: unknown;
}

export interface RestoreBody {
  slug?: unknown;
  rev?: unknown;
}

export interface ProtectBody {
  slug?: unknown;
  tier?: unknown;
}

export interface DeleteBody {
  slug?: unknown;
}

export interface GrantBody {
  key?: unknown;
}

export interface SuppressBody {
  type?: unknown; // "author" | "revision"
  value?: unknown;
  reason?: unknown;
}

export const MAX_CONTENT_BYTES = 100_000;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
export const NODE_ID_RE = /^[A-Za-z0-9_=-]+$/;
export const SHA_RE = /^[0-9a-f]{7,40}$/;
// A change-tag token (matches the filter/3RR/automod style, e.g. `edit-war`).
export const TAG_RE = /^[a-z][a-z0-9-]{0,30}$/;
export const MAX_TITLE_LEN = 120;
