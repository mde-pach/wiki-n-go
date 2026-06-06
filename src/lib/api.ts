import { config } from "../config";
import { authHeaders } from "./auth";

export interface EditResult {
  author: string;
  live: boolean; // true → published straight to the live branch; false → opened a PR
  prUrl?: string; // present when live === false
  url?: string; // commit URL when live === true
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
  const res = await fetch(`${config.workerUrl}${path}`, {
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
  const res = await fetch(`${config.workerUrl}${path}`, {
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
  const res = await fetch(`${config.workerUrl}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ slug, content, token, summary }),
  });
  // Pre-stream rejection, or the no-op fast path: both come back as plain JSON.
  const streamed = res.headers.get("Content-Type")?.includes("ndjson");
  if (!res.ok || !streamed || !res.body) return readJson<EditResult>(res);

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
        result?: EditResult;
        status?: number;
        error?: string;
      };
      if (event.type === "progress")
        onProgress?.({ progress: event.progress ?? 0, label: event.label ?? "" });
      else if (event.type === "done") return event.result as EditResult;
      else if (event.type === "error")
        throw new ApiError(event.status ?? 500, event.error ?? "Publish failed.");
    }
  }
  throw new Error("The publish stream ended before completing. Please try again.");
}
