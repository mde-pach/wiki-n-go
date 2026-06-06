import { ghNoreplyEmail, type Session, sessionIdentity } from "./auth";
import { isBanned } from "./bans";
import { ipHash } from "./crypto";
import { HttpError } from "./http";
import { enforceRateLimit, verifyTurnstile } from "./moderation";
import { editorTier, type Tier } from "./trust";
import type { Env } from "./types";

// Resolved identity behind a write: anonymous pseudonym or verified GitHub user.
// `name` is the display label + trusted-editors / commit-author name; `email`
// fills the commit author and keys trust-by-history; `key` namespaces bans and
// rate-limit counters.
export interface Writer {
  name: string;
  email: string;
  avatar: string | null;
  isAnon: boolean;
  key: string;
}

function anonWriter(hash: string): Writer {
  const name = `anon-${hash}`;
  return { name, email: `${name}@anon.invalid`, avatar: null, isAnon: true, key: name };
}

function githubWriter(s: Session): Writer {
  return {
    name: s.login,
    email: ghNoreplyEmail(s.id, s.login),
    avatar: s.avatar ?? null,
    isAnon: false,
    key: `gh:${s.login}`,
  };
}

// The request's identity: a verified GitHub session, else the anonymous
// pseudonym. With `gate`, this is a write: a GitHub session skips the bot check
// (OAuth already proved a human) while the anonymous path keeps Turnstile, and
// both reject bans and enforce the per-identity rate limit. Without it, it's a
// read-only actor lookup (whoami, patrol, review) — no gate.
export async function resolve(
  env: Env,
  request: Request,
  gate?: { token: unknown; path?: string },
): Promise<Writer> {
  const session = await sessionIdentity(env, request);
  const ip = request.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const writer = session
    ? githubWriter(session)
    : anonWriter(await ipHash(env.HASH_SECRET, ip));
  if (!gate) return writer;
  if (!session) await verifyTurnstile(env, ip, gate.token ? String(gate.token) : "");
  if (await isBanned(env, writer.key, gate.path))
    throw new HttpError(
      403,
      writer.isAnon ? "This source is blocked." : "This account is blocked.",
    );
  await enforceRateLimit(env, writer.key);
  return writer;
}

// Shared maintainer gate for the in-UI moderation actions. Works for an
// anonymous maintainer (by ip_hash) or a signed-in one (by GitHub login).
export async function requireMaintainer(
  env: Env,
  request: Request,
  action: string,
): Promise<Writer> {
  const writer = await resolve(env, request);
  if ((await editorTier(env, writer.name, writer.email)) !== "maintainer")
    throw new HttpError(403, `${action} requires maintainer access.`);
  return writer;
}

// The caller's pseudonym + trust tier, so the editor can show identity and
// gate privileged controls (e.g. the protection picker). No write, no token.
export async function whoami(
  env: Env,
  request: Request,
): Promise<{ author: string; tier: Tier; avatar: string | null; isAnon: boolean }> {
  const { name, email, avatar, isAnon } = await resolve(env, request);
  return { author: name, tier: await editorTier(env, name, email), avatar, isAnon };
}
