import type { Env } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// An ALLOWED_ORIGIN entry is either an exact origin (`https://wikigit.org`) or a
// wildcard (`https://*.wikigit.org`) matching any subdomain — the latter lets one
// multi-tenant Worker serve every `*.wikigit.org` instance without listing each.
function matchOrigin(entry: string, origin: string): boolean {
  if (entry === origin) return true;
  if (!entry.includes("*.")) return false;
  try {
    const o = new URL(origin);
    const base = new URL(entry.replace("*.", ""));
    return o.protocol === base.protocol && o.host.endsWith(`.${base.host}`);
  } catch {
    return false;
  }
}

// Empty allowlist = allow any (dev / unconfigured default).
export function originAllowed(env: Env, origin: string): boolean {
  const allowed = allowedOrigins(env);
  return allowed.length === 0 || allowed.some((entry) => matchOrigin(entry, origin));
}

export function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = allowedOrigins(env);
  const origin = request.headers.get("Origin") ?? "";
  const allow =
    allowed.length === 0 ? "*" : originAllowed(env, origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Wiki-Repo",
  };
}

export function json(
  data: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Stream a long operation as newline-delimited JSON: `run` reports progress via
// `emit`, and we frame the terminal value as `{type:"done"}` or, on a thrown
// error, `{type:"error", status}`. The HTTP status is already 200 by the time
// streaming starts, so a *mid-run* failure can only be reported in-band — that's
// the trade for live progress. Reject the request *before* calling this (clean
// HTTP status) for anything that can fail up front.
export function ndjsonStream(
  env: Env,
  request: Request,
  run: (emit: (progress: number, label: string) => void) => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await run((progress, label) =>
          send({ type: "progress", progress, label }),
        );
        send({ type: "done", result });
      } catch (err) {
        send({
          type: "error",
          status: err instanceof HttpError ? err.status : 500,
          error: message(err),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders(env, request),
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
