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

export function submitEdit(
  slug: string,
  content: string,
  token?: string,
  summary?: string,
): Promise<EditResult> {
  return postJson<EditResult>("/edit", { slug, content, token, summary });
}
