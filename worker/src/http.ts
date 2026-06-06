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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
