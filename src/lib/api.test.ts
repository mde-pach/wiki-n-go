import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Progress, submitEdit } from "./api";

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

const ndjson = (events: unknown[]) =>
  streamResponse([`${events.map((e) => JSON.stringify(e)).join("\n")}\n`]);

afterEach(() => vi.unstubAllGlobals());

describe("submitEdit streaming", () => {
  it("reports progress milestones and resolves with the terminal result", async () => {
    // Split a line across chunks to exercise the buffer reassembly.
    vi.stubGlobal("fetch", async () =>
      streamResponse([
        '{"type":"progress","progress":0.3,"label":"Opening pull reque',
        'st"}\n{"type":"progress","progress":0.9,"label":"Going live"}\n',
        '{"type":"done","result":{"live":true,"sha":"abc","author":"anon-x"}}\n',
      ]),
    );
    const seen: Progress[] = [];
    const result = await submitEdit("foo", "# Foo", undefined, "", (p) => seen.push(p));
    expect(seen.map((p) => p.label)).toEqual(["Opening pull request", "Going live"]);
    expect(seen.at(-1)?.progress).toBe(0.9);
    // The flag-bag wire shape is normalized into the tagged union at this boundary.
    expect(result).toEqual({ kind: "live", author: "anon-x", url: undefined });
  });

  it("throws an ApiError carrying the in-band status on a mid-publish failure", async () => {
    vi.stubGlobal("fetch", async () =>
      ndjson([
        { type: "progress", progress: 0.3, label: "Opening pull request" },
        { type: "error", status: 502, error: "GitHub 500" },
      ]),
    );
    await expect(submitEdit("foo", "# Foo")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "GitHub 500",
    });
  });

  it("surfaces a pre-stream rejection as a normal JSON ApiError", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "This edit was blocked by a filter." }, { status: 422 }),
    );
    await expect(submitEdit("foo", "# Foo")).rejects.toBeInstanceOf(ApiError);
    await expect(submitEdit("foo", "# Foo")).rejects.toMatchObject({ status: 422 });
  });

  it("handles the no-op JSON fast path without invoking onProgress", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ live: true, author: "anon-x" }, { status: 200 }),
    );
    const onProgress = vi.fn();
    const result = await submitEdit("foo", "# Foo", undefined, "", onProgress);
    expect(result).toEqual({ kind: "live", author: "anon-x", url: undefined });
    expect(onProgress).not.toHaveBeenCalled();
  });
});
