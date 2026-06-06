import { describe, expect, it } from "vitest";
import {
  APP_PERMISSIONS,
  buildManifest,
  cloudflareDeployUrl,
  installUrl,
  manifestActionUrl,
  randomSecret,
} from "./setup";

describe("buildManifest", () => {
  const m = buildManifest({
    owner: "octo",
    repo: "wiki",
    redirectUrl: "https://octo.github.io/wiki/setup",
    siteUrl: "https://octo.github.io/wiki/",
  });
  it("requests only the write scopes the Worker uses, no webhooks", () => {
    expect(m.default_permissions).toEqual(APP_PERMISSIONS);
    expect(m.default_permissions).toEqual({
      contents: "write",
      pull_requests: "write",
      discussions: "write",
    });
    expect(m.default_events).toEqual([]);
    expect(m.hook_attributes.active).toBe(false);
  });
  it("is private and round-trips through the page via redirect_url", () => {
    expect(m.public).toBe(false);
    expect(m.redirect_url).toBe("https://octo.github.io/wiki/setup");
  });
});

describe("manifestActionUrl", () => {
  it("targets the org endpoint for org-owned repos, else the user endpoint", () => {
    expect(manifestActionUrl({ isOrg: true, owner: "acme" })).toBe(
      "https://github.com/organizations/acme/settings/apps/new",
    );
    expect(manifestActionUrl({ isOrg: false, owner: "octo" })).toBe(
      "https://github.com/settings/apps/new",
    );
  });
});

describe("cloudflareDeployUrl", () => {
  it("points the deploy button at the fork's worker subdirectory", () => {
    const url = cloudflareDeployUrl({ owner: "octo", repo: "wiki", branch: "main" });
    expect(url).toBe(
      "https://deploy.workers.cloudflare.com/?url=" +
        encodeURIComponent("https://github.com/octo/wiki/tree/main/worker"),
    );
  });
});

describe("installUrl", () => {
  it("appends the installation path to the app's html_url", () => {
    expect(installUrl("https://github.com/apps/wiki-bot")).toBe(
      "https://github.com/apps/wiki-bot/installations/new",
    );
  });
});

describe("randomSecret", () => {
  it("is url-safe, unpadded, and unique per call", () => {
    const a = randomSecret();
    expect(a).not.toMatch(/[+/=]/);
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(randomSecret());
  });
});
