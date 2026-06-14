import { b64urlEncode } from "./crypto";
import { HttpError } from "./http";
import type { Env } from "./types";

// The App swap: when GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY are set, the Worker
// mints a short-lived, repo-scoped installation token per the App install
// instead of carrying a long-lived bot PAT. ghToken() prefers the App and falls
// back to GITHUB_TOKEN, so existing PAT deploys keep working unchanged.

const JWT_TTL_SEC = 540; // GitHub caps App JWTs at 10 min; stay under with margin.
const TOKEN_SKEW_MS = 60_000; // re-mint a minute before the installation token expires.

function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

// DER length octets: short form < 128, else long form (0x80|count then big-endian).
function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let v = n; v > 0; v = v >> 8) out.unshift(v & 0xff);
  return [0x80 | out.length, ...out];
}

// Wrap a PKCS#1 RSAPrivateKey DER in a PKCS#8 PrivateKeyInfo. WebCrypto only
// imports PKCS#8, and GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"), so we
// add the fixed rsaEncryption AlgorithmIdentifier wrapper rather than make the
// user run openssl.
export function wrapPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00];
  // SEQUENCE { OID 1.2.840.113549.1.1.1 (rsaEncryption), NULL }
  const algId = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05,
    0x00,
  ];
  const octet = [0x04, ...derLen(pkcs1.length), ...pkcs1];
  const inner = [...version, ...algId, ...octet];
  return Uint8Array.from([0x30, ...derLen(inner.length), ...inner]);
}

// Private-key PEM → PKCS#8 DER bytes ready for crypto.subtle.importKey. Accepts
// both GitHub's PKCS#1 and an already-PKCS#8 key.
export function pemToPkcs8Bytes(pem: string): Uint8Array<ArrayBuffer> {
  const der = pemBody(pem);
  return pem.includes("BEGIN RSA PRIVATE KEY") ? wrapPkcs1ToPkcs8(der) : der;
}

// A multi-line PEM can't survive every secret store: Docker build-args (Coolify)
// and many CI systems mangle embedded newlines. So also accept the key as one
// line with literal "\n" escapes, or base64-encoded — normalize back to a real
// PEM before parsing. A genuine PEM passes through unchanged.
export function normalizePrivateKey(raw: string): string {
  const s = raw.trim();
  if (s.includes("PRIVATE KEY")) return s.replace(/\\n/g, "\n");
  return atob(s.replace(/\s+/g, ""));
}

export function buildClaims(appId: string, nowSec: number) {
  return {
    iat: nowSec - 30, // backdate slightly for clock drift between us and GitHub
    exp: nowSec + JWT_TTL_SEC,
    iss: appId,
  };
}

async function importSigningKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Bytes(normalizePrivateKey(pem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function jwtSegment(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

// Sign an App JWT from an explicit id + key, so the same primitive serves both
// the content App (wikigit-app) and the operator provisioning App (wikigit-platform).
export async function signAppJwt(
  appId: string,
  privateKey: string,
  nowSec: number,
): Promise<string> {
  const key = await importSigningKey(privateKey);
  const signingInput = `${jwtSegment({ alg: "RS256", typ: "JWT" })}.${jwtSegment(
    buildClaims(appId, nowSec),
  )}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

export function appJwt(env: Env, nowSec: number): Promise<string> {
  return signAppJwt(
    env.GITHUB_APP_ID as string,
    env.GITHUB_APP_PRIVATE_KEY as string,
    nowSec,
  );
}

export function appHeaders(jwt: string, env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${env.REPO_NAME}-worker`,
  };
}

// Mint an installation access token from an App JWT + installation id. Shared by
// the content App (per-repo) and the provisioning App (the org installation).
export async function installationAccessToken(
  env: Env,
  jwt: string,
  installationId: string,
): Promise<{ token: string; expiresAtMs: number }> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    { method: "POST", headers: appHeaders(jwt, env) },
  );
  if (!res.ok) {
    throw new HttpError(502, `App token mint ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAtMs: new Date(data.expires_at).getTime() };
}

async function fetchInstallationId(
  env: Env,
  jwt: string,
  owner: string,
  name: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/installation`,
    { headers: appHeaders(jwt, env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `App installation lookup ${res.status}`);
  return String(((await res.json()) as { id: number }).id);
}

async function resolveInstallationId(env: Env, jwt: string): Promise<string> {
  if (env.GITHUB_APP_INSTALLATION_ID) return env.GITHUB_APP_INSTALLATION_ID;
  const id = await fetchInstallationId(env, jwt, env.REPO_OWNER, env.REPO_NAME);
  if (!id)
    throw new HttpError(502, "App installation lookup: install the app on the repo");
  return id;
}

// Is the App installed on this repo? (null if not.) Used by the multi-tenant
// gate to validate a request's target repo before serving it.
export async function repoInstallationId(
  env: Env,
  owner: string,
  name: string,
): Promise<string | null> {
  const jwt = await appJwt(env, Math.floor(Date.now() / 1000));
  return fetchInstallationId(env, jwt, owner, name);
}

// Installation tokens are per-installation, so the cache is keyed by repo: a
// multi-tenant Worker serves many repos (distinct installations) and must not
// hand one repo's token to another. Single-tenant has just one entry.
const tokenCache = new Map<string, { token: string; expiresAtMs: number }>();

async function mintInstallationToken(
  env: Env,
): Promise<{ token: string; expiresAtMs: number }> {
  const jwt = await appJwt(env, Math.floor(Date.now() / 1000));
  const installationId = await resolveInstallationId(env, jwt);
  return installationAccessToken(env, jwt, installationId);
}

async function installationToken(env: Env): Promise<string> {
  const repo = `${env.REPO_OWNER}/${env.REPO_NAME}`;
  const hit = tokenCache.get(repo);
  if (hit && hit.expiresAtMs - TOKEN_SKEW_MS > Date.now()) return hit.token;
  const fresh = await mintInstallationToken(env);
  tokenCache.set(repo, fresh);
  return fresh.token;
}

export function usingApp(env: Env): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export async function ghToken(env: Env): Promise<string> {
  if (usingApp(env)) return installationToken(env);
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "No GitHub credential configured");
  return env.GITHUB_TOKEN;
}
