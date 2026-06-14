import { describe, expect, it } from "vitest";
import { appInstallUrl, pagesSettingsUrl, repoUrl } from "./setup-status";

describe("setup-status URL builders", () => {
  it("builds the GitHub App install (connect) URL from a slug", () => {
    expect(appInstallUrl("my-app")).toBe(
      "https://github.com/apps/my-app/installations/new",
    );
  });

  it("falls back to the configured app slug when none is passed", () => {
    // config.githubAppSlug defaults to "wikigit"
    expect(appInstallUrl(null)).toBe(
      "https://github.com/apps/wikigit/installations/new",
    );
  });

  it("points repo + pages links at the configured repo", () => {
    expect(repoUrl()).toBe("https://github.com/mde-pach/wiki-n-go");
    expect(pagesSettingsUrl()).toBe(
      "https://github.com/mde-pach/wiki-n-go/settings/pages",
    );
  });
});
