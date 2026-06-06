import { b64urlEncode } from "./crypto";
import { HttpError } from "./http";
import type { Env } from "./types";

// The App swap: when GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY are set, the Worker
// mints a short-lived, repo-scoped installation token per the App install
// instead of carrying a long-lived bot PAT. ghToken() prefers the App and falls
// back to GITHUB_TOKEN, so existing PAT deploys keep working unchanged.

const JWT_TTL_SEC = 540; // GitHub caps App JWTs at 10 min; stay under with margin.
const TOKEN_SKEW_MS = 60_000; // re-mint a minute before the installation token expires.

function pemBody(pem: string): Uint8Array {
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
export function wrapPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
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
export function pemToPkcs8Bytes(pem: string): Uint8Array {
  const der = pemBody(pem);
  return pem.includes("BEGIN RSA PRIVATE KEY") ? wrapPkcs1ToPkcs8(der) : der;
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
    pemToPkcs8Bytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function jwtSegment(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export async function appJwt(env: Env, nowSec: number): Promise<string> {
  const key = await importSigningKey(env.GITHUB_APP_PRIVATE_KEY as string);
  const signingInput = `${jwtSegment({ alg: "RS256", typ: "JWT" })}.${jwtSegment(
    buildClaims(env.GITHUB_APP_ID as string, nowSec),
  )}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

function appHeaders(jwt: string, env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${env.REPO_NAME}-worker`,
  };
}

async function resolveInstallationId(env: Env, jwt: string): Promise<string> {
  if (env.GITHUB_APP_INSTALLATION_ID) return env.GITHUB_APP_INSTALLATION_ID;
  const res = await fetch(
    `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/installation`,
    { headers: appHeaders(jwt, env) },
  );
  if (!res.ok) {
    throw new HttpError(
      502,
      `App installation lookup ${res.status}: install the app on the repo`,
    );
  }
  return String(((await res.json()) as { id: number }).id);
}

let cached: { token: string; expiresAtMs: number } | null = null;

async function mintInstallationToken(
  env: Env,
): Promise<{ token: string; expiresAtMs: number }> {
  const jwt = await appJwt(env, Math.floor(Date.now() / 1000));
  const installationId = await resolveInstallationId(env, jwt);
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

async function installationToken(env: Env): Promise<string> {
  if (cached && cached.expiresAtMs - TOKEN_SKEW_MS > Date.now()) return cached.token;
  cached = await mintInstallationToken(env);
  return cached.token;
}

export function usingApp(env: Env): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export async function ghToken(env: Env): Promise<string> {
  if (usingApp(env)) return installationToken(env);
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "No GitHub credential configured");
  return env.GITHUB_TOKEN;
}
