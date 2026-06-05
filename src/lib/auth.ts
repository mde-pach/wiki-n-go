import { config } from "../config";

// The Worker hands back a signed session JWT in the URL fragment after sign-in;
// the client stores it and replays it as a bearer token. (Cookies can't be used
// here — the site and Worker are different origins, so a session cookie would be
// third-party and blocked.) The token is read for display only; the Worker is
// the sole verifier of its signature.
const KEY = "wiki_session";

export interface SessionInfo {
  login: string;
  avatar: string;
  exp: number;
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

export function login(returnUrl: string = location.href): void {
  location.href = `${config.workerUrl}/auth/login?return=${encodeURIComponent(returnUrl)}`;
}

export function logout(): void {
  localStorage.removeItem(KEY);
  location.reload();
}
