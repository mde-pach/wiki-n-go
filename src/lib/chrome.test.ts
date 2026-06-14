import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppearanceDefaults } from "../config";
import {
  applyWordmark,
  cacheChrome,
  chromeCacheKey,
  resolveAppearance,
} from "./chrome";

afterEach(() => vi.unstubAllGlobals());

const TENANT: AppearanceDefaults = {
  skin: "wiki",
  theme: "dark",
  width: "wide",
  textsize: "large",
};

describe("resolveAppearance", () => {
  const none = () => null;

  it("uses the tenant defaults when nothing is saved", () => {
    expect(resolveAppearance(TENANT, none, false)).toEqual({
      skin: "wiki",
      width: "wide",
      textsize: "large",
      theme: "dark",
    });
  });

  it("lets a reader's valid saved choice win over the tenant default", () => {
    const saved = (k: keyof AppearanceDefaults) => (k === "theme" ? "light" : null);
    expect(resolveAppearance(TENANT, saved, false).theme).toBe("light");
  });

  it("ignores an invalid saved value and falls back to the tenant default", () => {
    const saved = () => "neon";
    expect(resolveAppearance(TENANT, saved, false).skin).toBe("wiki");
  });

  it("resolves theme:auto against the OS preference", () => {
    const auto: AppearanceDefaults = { ...TENANT, theme: "auto" };
    expect(resolveAppearance(auto, none, true).theme).toBe("dark");
    expect(resolveAppearance(auto, none, false).theme).toBe("light");
  });
});

describe("applyWordmark", () => {
  function fakeEl() {
    const children: { className: string; textContent: string | null }[] = [];
    return {
      textContent: "wikigit" as string | null,
      className: "wordmark",
      children,
      appendChild(c: { className: string; textContent: string | null }) {
        children.push(c);
      },
    };
  }
  function fakeDoc(el: ReturnType<typeof fakeEl>) {
    return {
      querySelectorAll: () => [el],
      createElement: () => ({ className: "", textContent: null as string | null }),
    };
  }

  it("replaces the wordmark with the title and tagline", () => {
    const el = fakeEl();
    applyWordmark(fakeDoc(el), "Demo", "a demo wiki");
    expect(el.textContent).toBe("");
    expect(el.children.map((c) => [c.className, c.textContent])).toEqual([
      ["wm-title", "Demo"],
      ["wordmark-sub", "a demo wiki"],
    ]);
  });

  it("omits the tagline span when the tagline is empty", () => {
    const el = fakeEl();
    applyWordmark(fakeDoc(el), "Demo", "");
    expect(el.children).toHaveLength(1);
    expect(el.children[0].className).toBe("wm-title");
  });
});

describe("cacheChrome", () => {
  it("writes the bits to sessionStorage under the host key", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    cacheChrome("demo.wikigit.org", {
      title: "Demo",
      tagline: "t",
      appearance: TENANT,
    });
    expect(JSON.parse(store[chromeCacheKey("demo.wikigit.org")])).toEqual({
      title: "Demo",
      tagline: "t",
      appearance: TENANT,
    });
  });

  it("swallows storage errors (private mode)", () => {
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error("nope");
      },
    });
    expect(() =>
      cacheChrome("x", { title: "D", tagline: "", appearance: TENANT }),
    ).not.toThrow();
  });
});
