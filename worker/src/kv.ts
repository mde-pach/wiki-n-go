import type { KVPutOptions } from "./store";
import type { Env } from "./types";

export async function kvGetJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.RATE_LIMIT?.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvPutJson(
  env: Env,
  key: string,
  value: unknown,
  opts?: KVPutOptions,
): Promise<void> {
  await env.RATE_LIMIT?.put(key, JSON.stringify(value), opts);
}

// Read-through KV cache so many readers share one GitHub call. KV is the
// RATE_LIMIT binding; until it's bound, every call goes straight to `produce`.
export async function cached<T>(
  env: Env,
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
): Promise<T> {
  const kv = env.RATE_LIMIT;
  if (kv) {
    const raw = await kv.get(key);
    if (raw) {
      const hit = JSON.parse(raw) as { v: T; ts: number };
      if (Date.now() - hit.ts < ttlMs) return hit.v;
    }
  }
  const v = await produce();
  // Expire the row server-side too (≈2× the logical TTL, KV's 60s floor): the
  // staleness check above governs reads, this just reaps dead keys so per-tenant
  // caches (r:owner/name:*) don't grow unbounded. CF KV requires ≥60s.
  if (kv)
    await kv.put(key, JSON.stringify({ v, ts: Date.now() }), {
      expirationTtl: Math.max(60, Math.ceil((ttlMs / 1000) * 2)),
    });
  return v;
}

// Drop the cached content pointers so the next read reflects a write. The direct-edit
// path keeps `meta:index` (it patches that entry in place via updateIndexEntry).
export async function invalidateContent(
  env: Env,
  // The provider-qualified identity key (writer.key: `gh:`/`wg:`/`anon-…`), NOT
  // the bare display name — the trust cache is keyed by `key`, so passing `name`
  // would never bust it for a signed-in editor.
  idKey?: string,
  opts: { keepIndex?: boolean } = {},
): Promise<void> {
  const kv = env.RATE_LIMIT;
  if (!kv) return;
  await kv.delete("meta:latest-sha");
  await kv.delete("meta:pages");
  if (!opts.keepIndex) await kv.delete("meta:index");
  if (idKey) await kv.delete(`trust:${idKey}`);
}
