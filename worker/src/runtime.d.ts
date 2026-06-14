// Minimal ambient types for the Bun-runtime entry (server.ts). The Worker build
// uses @cloudflare/workers-types only; rather than pull in @types/bun (which
// redeclares Request/Response/fetch and clashes), declare just what server.ts
// touches. Bun provides the real implementations at runtime.
declare const Bun: {
  serve(options: {
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
  }): { port: number; stop(): void };
};

declare const process: {
  env: Record<string, string | undefined>;
  on(signal: string, listener: () => void): void;
  exit(code: number): void;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
