// Portable in-memory KV for the no-DB Bun runtime (M11). The Worker only uses a
// small slice of the Cloudflare KV API — get / put(+expirationTtl) / delete /
// list({prefix}) — so this implements exactly that, with TTL enforced lazily on
// read (no timers). It's the backing store the Bun `env.RATE_LIMIT` is built
// from; all of it is ephemeral by design (rate-limit windows, PoW single-use,
// trust/index/cite caches) — durable state lives in git, not here. The
// `namespacedKV` wrapper composes over this unchanged on multi-tenant.
//
// Caveat (documented in SPEC M11): a single process owns this Map, so horizontal
// scale shards by tenant rather than sharing the store. A restart drops it —
// harmless for caches/short-lived counters; the only durable decisions (patrol,
// tags) move to a git append-log (M11.3).

export type KVPutOptions = { expirationTtl?: number; expiration?: number };
export type KVListOptions = { prefix?: string; limit?: number; cursor?: string };
export type KVListResult = {
  keys: { name: string }[];
  list_complete: boolean;
  cursor?: string;
};

// The KV surface the Engine actually uses — a small subset of the Cloudflare KV
// API. Both MemoryKV (Bun) and a real CF KVNamespace satisfy it, so the rest of
// the code is binding-agnostic and we don't depend on @cloudflare/workers-types.
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: KVListOptions): Promise<KVListResult>;
}

interface Entry {
  value: string;
  expiresAt: number | null; // epoch ms, or null = never
}

type PutOptions = KVPutOptions;
type ListOptions = KVListOptions;

export class MemoryKV implements KV {
  private map = new Map<string, Entry>();
  // Injectable clock so TTL is deterministically testable.
  constructor(private now: () => number = () => Date.now()) {}

  private live(key: string): Entry | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  put(key: string, value: string, opts?: PutOptions): Promise<void> {
    const ttlMs = opts?.expirationTtl != null ? opts.expirationTtl * 1000 : null;
    const expiresAt =
      opts?.expiration != null
        ? opts.expiration * 1000
        : ttlMs != null
          ? this.now() + ttlMs
          : null;
    this.map.set(key, { value, expiresAt });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  list(opts?: ListOptions): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = opts?.prefix ?? "";
    const keys: { name: string }[] = [];
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix) && this.live(key)) keys.push({ name: key });
    }
    const limited = opts?.limit != null ? keys.slice(0, opts.limit) : keys;
    return Promise.resolve({ keys: limited, list_complete: true });
  }

  // Test/ops helper: drop everything (e.g. between test cases).
  clear(): void {
    this.map.clear();
  }
}
