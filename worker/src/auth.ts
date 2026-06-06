import { b64urlDecode, b64urlEncode, hmacSign, timingSafeEq } from "./crypto";
import { allowedOrigins, HttpError } from "./http";
import type { Env } from "./types";

// No DB, no stored user token: a session is a compact HS256 JWT carrying only
// the verified GitHub identity. We never request email scope — the commit
// author uses GitHub's public no-reply email, so no raw PII is stored.
export interface Session {
  login: string;
  id: number;
  avatar: string;
  exp: number;
}

const SESSION_TTL_MS = 7 * 86_400_000;

export const ghNoreplyEmail = (id: number, login: string): string =>
  `${id}+${login}@users.noreply.github.com`;

export async function signSession(
  secret: string,
  who: { login: string; id: number; avatar: string },
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
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(claims))) as Session;
    if (typeof body.login !== "string" || typeof body.id !== "number") return null;
    if (typeof body.exp !== "number" || body.exp * 1000 < nowMs) return null;
    return body;
  } catch {
    return null;
  }
}

// CSRF state for the OAuth round-trip: the signed, short-lived return URL — no
// KV write needed, the signature is the anti-forgery proof.
async function signState(secret: string, ret: string): Promise<string> {
  const body = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ r: ret, t: Date.now() })),
  );
  return `${body}.${b64urlEncode(await hmacSign(secret, body))}`;
}

async function verifyState(secret: string, state: string): Promise<string | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEq(sig, b64urlEncode(await hmacSign(secret, body)))) return null;
  try {
    const { r, t } = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof t !== "number" || Date.now() - t > 600_000) return null;
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}

export function oauthConfigured(env: Env): boolean {
  return Boolean(env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET && env.SESSION_SECRET);
}

// Guard the post-sign-in redirect against open-redirect: the return URL must
// live on a configured site origin.
function isAllowedReturn(env: Env, ret: string): boolean {
  let u: URL;
  try {
    u = new URL(ret);
  } catch {
    return false;
  }
  const allowed = allowedOrigins(env);
  return allowed.length === 0 || allowed.includes(u.origin);
}

export async function authLogin(env: Env, url: URL): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "Sign-in is not configured.");
  const ret = url.searchParams.get("return") ?? allowedOrigins(env)[0] ?? url.origin;
  if (!isAllowedReturn(env, ret)) throw new HttpError(400, "Invalid return URL.");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.OAUTH_CLIENT_ID as string);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set(
    "state",
    await signState(env.SESSION_SECRET as string, ret),
  );
  return Response.redirect(authorize.toString(), 302);
}

export async function authCallback(env: Env, url: URL): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "Sign-in is not configured.");
  const ret = await verifyState(
    env.SESSION_SECRET as string,
    url.searchParams.get("state") ?? "",
  );
  if (!ret || !isAllowedReturn(env, ret))
    throw new HttpError(400, "Invalid sign-in state.");
  const code = url.searchParams.get("code");
  if (!code) throw new HttpError(400, "Missing authorization code.");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new HttpError(502, "Sign-in exchange failed.");

  // Use the token once to read the verified identity, then discard it.
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": `${env.REPO_NAME}-worker`,
    },
  });
  if (!userRes.ok) throw new HttpError(502, "Could not read your GitHub profile.");
  const u = (await userRes.json()) as { login: string; id: number; avatar_url: string };

  const jwt = await signSession(env.SESSION_SECRET as string, {
    login: u.login,
    id: u.id,
    avatar: u.avatar_url,
  });
  const dest = new URL(ret);
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
