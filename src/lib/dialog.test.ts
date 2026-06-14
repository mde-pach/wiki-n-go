import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogBehavior } from "./dialog";

// Minimal DOM doubles — the helper only touches addEventListener/removeEventListener,
// querySelectorAll, focus, and requestAnimationFrame.
function makeEl(buttons: number) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const focusCalls: HTMLElement[] = [];
  const items = Array.from({ length: buttons }, () => {
    const b = {
      focus: () => focusCalls.push(b as unknown as HTMLElement),
      offsetParent: {},
    };
    return b;
  });
  const el = {
    listeners,
    focusCalls,
    items,
    tabIndex: 0,
    focus: vi.fn(),
    querySelectorAll: () => items,
    addEventListener: (t: string, cb: (e: unknown) => void) => {
      listeners[t] ??= [];
      listeners[t].push(cb);
    },
    removeEventListener: (t: string, cb: (e: unknown) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== cb);
    },
    fire: (t: string, e: unknown) => {
      for (const f of listeners[t] ?? []) f(e);
    },
  };
  return el as unknown as HTMLElement & typeof el;
}

describe("dialogBehavior", () => {
  const prevFocus = { focus: vi.fn() };

  afterEach(() => vi.restoreAllMocks());

  it("calls onCancel on Escape and removes the listener on cleanup", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());
    vi.stubGlobal("document", { activeElement: prevFocus });
    const el = makeEl(2);
    const onCancel = vi.fn();
    const cleanup = dialogBehavior(el, onCancel);

    const prevent = vi.fn();
    el.fire("keydown", { key: "Escape", preventDefault: prevent });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(prevent).toHaveBeenCalled();

    cleanup();
    expect(el.listeners.keydown).toHaveLength(0);
    expect(prevFocus.focus).toHaveBeenCalled(); // focus restored on cleanup
    vi.unstubAllGlobals();
  });

  it("moves focus to the first focusable on open", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());
    vi.stubGlobal("document", { activeElement: prevFocus });
    const el = makeEl(2);
    dialogBehavior(el, () => {});
    expect(el.focusCalls).toHaveLength(1); // first button focused
    vi.unstubAllGlobals();
  });
});
