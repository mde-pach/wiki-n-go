import { describe, expect, it } from "vitest";
import { enabledProviders } from "./auth";

describe("enabledProviders", () => {
  it("offers both when the Worker hasn't answered yet", () => {
    expect(enabledProviders(undefined)).toEqual(["github", "wikigit"]);
  });

  it("offers only the providers the Worker reports enabled, in display order", () => {
    expect(enabledProviders({ github: false, wikigit: true })).toEqual(["wikigit"]);
    expect(enabledProviders({ github: true, wikigit: false })).toEqual(["github"]);
    expect(enabledProviders({ github: true, wikigit: true })).toEqual([
      "github",
      "wikigit",
    ]);
  });

  it("offers none when the Worker reports both disabled", () => {
    expect(enabledProviders({ github: false, wikigit: false })).toEqual([]);
  });
});
