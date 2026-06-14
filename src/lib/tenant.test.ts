import { afterEach, describe, expect, it, vi } from "vitest";
import { activeRepo, engineUrl } from "./engine";
import { bootTenant, resetTenantBoot, subdomainLabel } from "./tenant";

function fakeSession() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _map: m,
  };
}

function onHost(host: string) {
  vi.stubGlobal("window", { location: { host } });
  const store = fakeSession();
  vi.stubGlobal("sessionStorage", store);
  return store;
}

afterEach(() => {
  resetTenantBoot();
  vi.unstubAllGlobals();
});

describe("subdomainLabel", () => {
  const P = "wikigit.org";
  it("extracts a subdomain label", () => {
    expect(subdomainLabel("recipes.wikigit.org", P)).toBe("recipes");
  });
  it("apex → empty, www stays www", () => {
    expect(subdomainLabel("wikigit.org", P)).toBe("");
    expect(subdomainLabel("www.wikigit.org", P)).toBe("www");
  });
  it("ignores port + trailing dot", () => {
    expect(subdomainLabel("recipes.wikigit.org:443.", P)).toBe("recipes");
  });
  it("null for a host outside the platform domain", () => {
    expect(subdomainLabel("bob.github.io", P)).toBeNull();
  });
});

describe("bootTenant", () => {
  it("resolves a subdomain → activeRepo, and routes Engine calls through it", async () => {
    onHost("recipes.wikigit.org");
    const fetchMock = vi.fn(async () =>
      Response.json({ repo: "bob/cookbook", lane: "byo", name: "recipes" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await bootTenant();

    expect(activeRepo()).toEqual({ owner: "bob", name: "cookbook" });
    expect(engineUrl("/pages")).toContain("repo=bob%2Fcookbook");
    // The single /resolve request carried the hostname.
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/resolve?host=recipes.wikigit.org",
    );
  });

  it("uses the sessionStorage cache without a second /resolve", async () => {
    const store = onHost("recipes.wikigit.org");
    store.setItem("wikigit:tenant:recipes.wikigit.org", "bob/cookbook");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await bootTenant();

    expect(activeRepo()).toEqual({ owner: "bob", name: "cookbook" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op on the apex (keeps baked config, no network)", async () => {
    onHost("wikigit.org");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await bootTenant();

    expect(activeRepo()).toEqual({ owner: "mde-pach", name: "wiki-n-go" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to baked config when the subdomain is unregistered (404)", async () => {
    onHost("ghost.wikigit.org");
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));

    await bootTenant();

    expect(activeRepo()).toEqual({ owner: "mde-pach", name: "wiki-n-go" });
  });
});
