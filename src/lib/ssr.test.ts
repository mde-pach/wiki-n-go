import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageSlugs, fetchRevisions, pageNoindex } from "./ssr";

afterEach(() => vi.unstubAllGlobals());

describe("pageNoindex (server-side noindex-until-patrolled)", () => {
  it("noindexes an unpatrolled page", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ patrolled: false }));
    expect(await pageNoindex("intro")).toBe(true);
  });

  it("indexes a patrolled page", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ patrolled: true }));
    expect(await pageNoindex("intro")).toBe(false);
  });

  it("fails open (indexable) on a Worker error or non-ok response", async () => {
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 500 }));
    expect(await pageNoindex("intro")).toBe(false);
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    expect(await pageNoindex("intro")).toBe(false);
  });
});

describe("fetchPageSlugs / fetchRevisions (fail-soft data sources)", () => {
  it("returns the slug set on success and an empty set on failure", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ pages: ["a", "b"] }));
    expect([...(await fetchPageSlugs())]).toEqual(["a", "b"]);
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    expect((await fetchPageSlugs()).size).toBe(0);
  });

  it("returns revisions on success and [] on failure", async () => {
    const rev = { sha: "s", parent: null, author: "anon-x", date: "", message: "m" };
    vi.stubGlobal("fetch", async () => Response.json({ revisions: [rev] }));
    expect(await fetchRevisions("intro")).toEqual([rev]);
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 404 }));
    expect(await fetchRevisions("intro")).toEqual([]);
  });
});
