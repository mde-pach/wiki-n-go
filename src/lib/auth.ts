import { config } from "../config";

// The Worker hands back a signed session JWT in the URL fragment after sign-in;
// the client stores it and replays it as a bearer token. (Cookies can't be used
// here — the site and Worker are different origins, so a session cookie would be
// third-party and blocked.) The token is read for display only; the Worker is
// the sole verifier of its signature.
const KEY = "wiki_session";
// Last known `/auth/status` result, so the button's initial render doesn't wait
// on a Worker round-trip (which made the auth chrome blink in after first paint).
const PROVIDERS_KEY = "wiki_auth_providers";

export interface SessionInfo {
  login: string;
  avatar: string;
  provider?: "github" | "wikigit";
  exp: number;
}

export interface Providers {
  github: boolean;
  wikigit: boolean;
}

function decode(token: string): SessionInfo | null {
  try {
    const claims = token.split(".")[1] ?? "";
    const b64 = claims.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const body = JSON.parse(atob(b64 + pad)) as SessionInfo;
    if (!body.login || typeof body.exp !== "number") return null;
    if (body.exp * 1000 < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

// Which sign-in providers the Worker has configured — drives the buttons, so
// enabling one needs only a Worker deploy (no site rebuild, no flag).
export async function authProviders(): Promise<Providers> {
  try {
    const res = await fetch(`${config.workerUrl}/auth/status`);
    const data = res.ok
      ? ((await res.json()) as { enabled?: boolean; providers?: Partial<Providers> })
      : {};
    // Fall back to GitHub if an older Worker reports only `enabled`.
    const src = data.providers ?? (data.enabled ? { github: true } : {});
    const p: Providers = { github: !!src.github, wikigit: !!src.wikigit };
    if (typeof window !== "undefined")
      localStorage.setItem(PROVIDERS_KEY, JSON.stringify(p));
    return p;
  } catch {
    return { github: false, wikigit: false }; // a network blip shouldn't poison the cache
  }
}

// Synchronous last-known providers for first paint; undefined before the first
// successful `authProviders()` of the session.
export function authProvidersCached(): Providers | undefined {
  if (typeof window === "undefined") return undefined;
  const v = localStorage.getItem(PROVIDERS_KEY);
  if (!v) return undefined;
  try {
    const p = JSON.parse(v) as Partial<Providers>;
    return { github: !!p.github, wikigit: !!p.wikigit };
  } catch {
    return undefined;
  }
}

export function getSession(): SessionInfo | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(KEY);
  if (!token) return null;
  const info = decode(token);
  if (!info) localStorage.removeItem(KEY);
  return info;
}

export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function login(
  provider: "github" | "wikigit" = "github",
  returnUrl: string = location.href,
): void {
  const ret = encodeURIComponent(returnUrl);
  location.href = `${config.workerUrl}/auth/login?provider=${provider}&return=${ret}`;
}

export function logout(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem("wiki_tier"); // drop the cached maintainer hint
  location.reload();
}
