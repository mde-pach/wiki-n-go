export interface Env {
  GITHUB_TOKEN: string;
  HASH_SECRET: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  BRANCH: string;
  CONTENT_DIR: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT?: KVNamespace; // unset until a KV namespace is bound; rate limiting then activates
  TURNSTILE_SECRET?: string; // unset until a Turnstile widget is wired; bot check then activates
  // Discussion target. Both IDs are derived at runtime from REPO_OWNER/REPO_NAME
  // + DISCUSSION_CATEGORY (so a fork needs no manual lookup); set them only to
  // override the derivation.
  REPO_ID?: string;
  DISCUSSION_CATEGORY_ID?: string;
  DISCUSSION_CATEGORY?: string; // category name to post talk topics in (default "General")
  // Autonomous-editing knobs (all optional; defaults keep the reviewed-PR model).
  DEFAULT_EDIT_TIER?: string; // tier required to edit a path with no protection.json rule (default "maintainer")
  AUTOCONFIRM_EDITS?: string; // accepted edits for the "auto" tier (default 10)
  AUTOCONFIRM_DAYS?: string; // age in days for the "auto" tier (default 4)
  EXTENDED_EDITS?: string; // accepted edits for the "extended" tier (default 500)
  EXTENDED_DAYS?: string; // age in days for the "extended" tier (default 30)
  AUTOPATROL_TIER?: string; // min tier whose edits land pre-patrolled (default "extended")
  HOME_SLUG?: string; // slug treated as the home page (excluded from orphans; default "index")
  // Optional GitHub sign-in. Unset → sign-in is disabled and every path stays
  // anonymous. CLIENT_ID is public; CLIENT_SECRET + SESSION_SECRET are secrets.
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
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
export const MAX_TITLE_LEN = 120;
