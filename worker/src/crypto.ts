export async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
}

// 64 bits of the HMAC: enough that distinct IPs effectively never collide into a
// shared ban / rate-limit bucket (32 bits birthday-collided at ~65k addresses),
// while staying short enough for a readable `anon-<hash>` pseudonym. Still a
// one-way derivation — the raw IP is never stored (privacy invariant).
export async function ipHash(secret: string, ip: string): Promise<string> {
  const sig = await hmacSign(secret, ip);
  return [...sig]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Constant-time string compare so signature checks don't leak via timing.
export function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toBase64(str: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(str)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function utf8Bytes(str: string): number {
  return new TextEncoder().encode(str).length;
}
