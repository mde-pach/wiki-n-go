import { afterEach, describe, expect, it, vi } from "vitest";
import { editorTier } from "./trust";
import type { Env } from "./types";

afterEach(() => vi.unstubAllGlobals());

// editorTier reads two repo-root files over raw.githubusercontent: the imperative
// trusted-editors.json and the declarative wikigit.json maintainers. A maintainer
// match short-circuits before the commit-history (trust-stats) path, so these
// stubs are enough.
function stubFiles(files: Record<string, unknown>) {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    for (const [name, value] of Object.entries(files)) {
      if (url.endsWith(`/${name}`)) return Response.json(value);
    }
    return new Response("", { status: 404 });
  });
}

const env = { REPO_OWNER: "acme", REPO_NAME: "wiki", BRANCH: "main" } as Env;

describe("editorTier honours wikigit.json maintainers", () => {
  it("grants maintainer to a config-declared login (gh:<login>)", async () => {
    stubFiles({
      "wikigit.json": { maintainers: ["alice"] },
      "trusted-editors.json": [],
    });
    expect(await editorTier(env, "a@x", "gh:alice")).toBe("maintainer");
  });

  it("grants maintainer to an explicit wg: maintainer key", async () => {
    stubFiles({
      "wikigit.json": { maintainers: ["wg:42"] },
      "trusted-editors.json": [],
    });
    expect(await editorTier(env, "a@x", "wg:42")).toBe("maintainer");
  });

  it("still honours the trusted-editors.json list (union)", async () => {
    stubFiles({ "wikigit.json": {}, "trusted-editors.json": ["bob"] });
    expect(await editorTier(env, "b@x", "gh:bob")).toBe("maintainer");
  });

  it("always grants the repo owner", async () => {
    stubFiles({ "wikigit.json": {}, "trusted-editors.json": [] });
    expect(await editorTier(env, "o@x", "gh:acme")).toBe("maintainer");
  });
});
