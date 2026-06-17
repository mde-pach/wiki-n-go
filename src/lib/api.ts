import { authHeaders } from "./auth";
import { engineFetch } from "./tenant";

// The terminal outcome of a submit, as a tagged union so every case is handled
// explicitly. Normalized at this boundary from the Worker's flag-bag wire shape.
export type EditResult =
  | { kind: "live"; author: string; url?: string } // published to the live branch
  | { kind: "reverted"; author: string; url?: string } // published, then auto-reverted
  | { kind: "pending"; author: string; prUrl: string }; // opened a PR for review

interface WireEditResult {
  author: string;
  live: boolean;
  prUrl?: string;
  url?: string;
  autoReverted?: boolean;
}

function toEditResult(w: WireEditResult): EditResult {
  if (w.autoReverted) return { kind: "reverted", author: w.author, url: w.url };
  if (w.live) return { kind: "live", author: w.author, url: w.url };
  return { kind: "pending", author: w.author, prUrl: w.prUrl ?? "" };
}

export type Tier = "open" | "auto" | "extended" | "maintainer";

export interface WhoAmI {
  author: string;
  tier: Tier;
  avatar: string | null;
  isAnon: boolean;
}

interface RequestOptions {
  auth?: boolean;
  cache?: RequestCache;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok)
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function getJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await engineFetch(path, {
    cache: opts.cache ?? "no-store",
    headers: opts.auth ? authHeaders() : undefined,
  });
  return readJson<T>(res);
}

export async function postJson<T>(
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const auth = opts.auth ?? true;
  const res = await engineFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  });
  return readJson<T>(res);
}

export function getWhoami(): Promise<WhoAmI> {
  return getJson<WhoAmI>("/whoami", { auth: true });
}

export interface Progress {
  progress: number; // 0..1
  label: string;
}

// Submit an edit. The Worker rejects up front with a normal JSON error (ban,
// filter, bad slug) but streams the publish phase as NDJSON progress events,
// ending in a terminal result. `onProgress` is called for each milestone.
export async function submitEdit(
  slug: string,
  content: string,
  token?: string,
  summary?: string,
  onProgress?: (p: Progress) => void,
): Promise<EditResult> {
  const res = await engineFetch("/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ slug, content, token, summary }),
  });
  // Pre-stream rejection, or the no-op fast path: both come back as plain JSON.
  const streamed = res.headers.get("Content-Type")?.includes("ndjson");
  if (!res.ok || !streamed || !res.body)
    return toEditResult(await readJson<WireEditResult>(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line) as {
        type: "progress" | "done" | "error";
        progress?: number;
        label?: string;
        result?: WireEditResult;
        status?: number;
        error?: string;
      };
      if (event.type === "progress")
        onProgress?.({ progress: event.progress ?? 0, label: event.label ?? "" });
      else if (event.type === "done")
        return toEditResult(event.result as WireEditResult);
      else if (event.type === "error")
        throw new ApiError(event.status ?? 500, event.error ?? "Publish failed.");
    }
  }
  throw new Error("The publish stream ended before completing. Please try again.");
}
