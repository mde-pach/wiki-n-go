import { afterEach, describe, expect, it, vi } from "vitest";
import { onSwapReset } from "./cache-reset";

afterEach(() => vi.unstubAllGlobals());

describe("onSwapReset", () => {
  it("runs every registered reset when astro:after-swap fires", () => {
    let handler: (() => void) | undefined;
    let eventName: string | undefined;
    vi.stubGlobal("document", {
      addEventListener: (e: string, h: () => void) => {
        eventName = e;
        handler = h;
      },
    });

    const a = vi.fn();
    const b = vi.fn();
    onSwapReset(a);
    onSwapReset(b);

    expect(eventName).toBe("astro:after-swap");
    expect(a).not.toHaveBeenCalled();
    handler?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
