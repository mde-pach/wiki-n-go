import { b64urlDecode, b64urlEncode, hmacSign, timingSafeEq } from "../crypto";
import { allowedOrigins, HttpError, originAllowed } from "../http";
import type { Env } from "../types";
import { getProvider, type ProviderId, providerStatus } from "./providers";

// No DB, no stored user token: a session is a compact HS256 JWT carrying only
// the verified identity (GitHub or Wikigit). We never request an email scope —
// the commit author is a derived no-PII label, so no raw PII is stored.
export interface Session {
  login: string;
  id: number;
  avatar: string;
  provider?: ProviderId; // undefined = legacy token, treated as GitHub
  sub?: string; // stable unique id (Wikigit) — the `wg:` key, survives handle changes
  exp: number;
}

const SESSION_TTL_MS = 7 * 86_400_000;

export const ghNoreplyEmail = (id: number, login: string): string =>
  `${id}+${login}@users.noreply.github.com`;

export async function signSession(
  secret: string,
  who: {
    login: string;
    id: number;
    avatar: string;
    provider?: ProviderId;
    sub?: string;
  },
  nowMs: number = Date.now(),
): Promise<string> {
  const header = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const claims = b64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ ...who, exp: Math.floor((nowMs + SESSION_TTL_MS) / 1000) }),
    ),
  );
  const signing = `${header}.${claims}`;
  return `${signing}.${b64urlEncode(await hmacSign(secret, signing))}`;
}

export async function verifySession(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, claims, sig] = parts;
  const expected = b64urlEncode(await hmacSign(secret, `${header}.${claims}`));
  if (!timingSafeEq(sig, expected)) return null;
  try {
    // Pin the algorithm: only ever accept the HS256 JWTs we mint, so a forged
    // header (e.g. alg:"none") can't slip past even if signing ever changes.
    const head = JSON.parse(new TextDecoder().decode(b64urlDecode(header)));
    if (head?.alg !== "HS256" || head?.typ !== "JWT") return null;
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(claims))) as Session;
    if (typeof body.login !== "string" || typeof body.id !== "number") return null;
    if (typeof body.exp !== "number" || body.exp * 1000 < nowMs) return null;
    return body;
  } catch {
    return null;
  }
}

// CSRF state for the OAuth round-trip: the signed, short-lived return URL plus
// the chosen provider (so one /auth/callback serves both) — no KV write needed,
// the signature is the anti-forgery proof.
async function signState(
  secret: string,
  ret: string,
  provider: ProviderId,
): Promise<string> {
  const body = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ r: ret, p: provider, t: Date.now() })),
  );
  return `${body}.${b64urlEncode(await hmacSign(secret, body))}`;
}

async function verifyState(
  secret: string,
  state: string,
): Promise<{ ret: string; provider: ProviderId } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEq(sig, b64urlEncode(await hmacSign(secret, body)))) return null;
  try {
    const { r, p, t } = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof t !== "number" || Date.now() - t > 600_000) return null;
    if (typeof r !== "string") return null;
    return { ret: r, provider: p === "wikigit" ? "wikigit" : "github" };
  } catch {
    return null;
  }
}

// Which sign-in providers are live. `enabled` (any provider + a session secret)
// keeps the old /auth/status contract; `providers` drives per-provider buttons.
export function authStatus(env: Env): {
  enabled: boolean;
  providers: Record<ProviderId, boolean>;
} {
  const providers = providerStatus(env);
  const enabled = Boolean(env.SESSION_SECRET) && Object.values(providers).some(Boolean);
  return { enabled, providers };
}

// Guard the post-sign-in redirect against open-redirect: the return URL must
// live on a configured site origin (exact or `*.wikigit.org` wildcard). Unlike
// CORS, this fails **closed** when ALLOWED_ORIGIN is unset — an empty allowlist
// must not green-light every origin, or the session JWT (in the redirect hash)
// could be sent anywhere.
function isAllowedReturn(env: Env, ret: string): boolean {
  if (allowedOrigins(env).length === 0) return false;
  try {
    return originAllowed(env, new URL(ret).origin);
  } catch {
    return false;
  }
}

// `?provider=` picks the provider (default github); the callback path is shared
// — the provider rides the signed state.
export async function authLogin(env: Env, url: URL): Promise<Response> {
  const provider = getProvider(url.searchParams.get("provider") ?? "github");
  if (!provider?.configured(env) || !env.SESSION_SECRET)
    throw new HttpError(503, "Sign-in is not configured.");
  const ret = url.searchParams.get("return") ?? allowedOrigins(env)[0] ?? url.origin;
  if (!isAllowedReturn(env, ret)) throw new HttpError(400, "Invalid return URL.");
  const state = await signState(env.SESSION_SECRET, ret, provider.id);
  const authorize = await provider.authorizeUrl(
    env,
    `${url.origin}/auth/callback`,
    state,
  );
  return Response.redirect(authorize, 302);
}

export async function authCallback(env: Env, url: URL): Promise<Response> {
  if (!env.SESSION_SECRET) throw new HttpError(503, "Sign-in is not configured.");
  const st = await verifyState(env.SESSION_SECRET, url.searchParams.get("state") ?? "");
  if (!st || !isAllowedReturn(env, st.ret))
    throw new HttpError(400, "Invalid sign-in state.");
  const provider = getProvider(st.provider);
  if (!provider?.configured(env))
    throw new HttpError(503, "Sign-in is not configured.");
  const code = url.searchParams.get("code");
  if (!code) throw new HttpError(400, "Missing authorization code.");

  const who = await provider.exchange(env, code, `${url.origin}/auth/callback`);
  const jwt = await signSession(env.SESSION_SECRET, {
    login: who.login,
    id: who.id,
    avatar: who.avatar,
    provider: who.provider,
    sub: who.sub,
  });
  const dest = new URL(st.ret);
  dest.hash = `wikitoken=${jwt}`;
  return Response.redirect(dest.toString(), 302);
}

export async function sessionIdentity(
  env: Env,
  request: Request,
): Promise<Session | null> {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/);
  return m ? verifySession(env.SESSION_SECRET, m[1]) : null;
}
