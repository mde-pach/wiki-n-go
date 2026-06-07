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

export function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = allowedOrigins(env);
  const origin = request.headers.get("Origin") ?? "";
  const allow =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
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
