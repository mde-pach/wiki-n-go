import { describe, expect, it } from "vitest";
import {
  latestByName,
  nameAvailability,
  parseRegistry,
  resolveHost,
  tenantLabel,
  validName,
} from "./registry";
import { MemoryKV } from "./store";
import type { Env } from "./types";

const LINES = [
  JSON.stringify({
    name: "recipes",
    repo: "bob/cookbook",
    owner: "gh:bob",
    lane: "byo",
    at: "t1",
  }),
  JSON.stringify({
    name: "acme",
    repo: "wikigit-tenants/acme",
    owner: "wg:jane",
    lane: "platform",
    at: "t2",
  }),
].join("\n");

// Seed the registry read-cache so the pure logic is exercised without GitHub.
function env(raw: string): Env {
  const kv = new MemoryKV();
  kv.put("registry:raw", raw);
  return {
    REPO_OWNER: "mde-pach",
    REPO_NAME: "wiki-n-go",
    PLATFORM_HOST: "wikigit.org",
    RATE_LIMIT: kv,
  } as unknown as Env;
}

describe("parseRegistry / latestByName", () => {
  it("parses valid lines and skips garbage", () => {
    const t = parseRegistry(`${LINES}\nnot json\n{"name":"x"}\n`);
    expect(t.map((x) => x.name)).toEqual(["recipes", "acme"]);
  });

  it("last write wins for a repeated name", () => {
    const raw = [
      JSON.stringify({ name: "a", repo: "x/1", owner: "o", lane: "byo", at: "t1" }),
      JSON.stringify({ name: "a", repo: "x/2", owner: "o", lane: "byo", at: "t2" }),
    ].join("\n");
    expect(latestByName(parseRegistry(raw)).get("a")?.repo).toBe("x/2");
  });
});

describe("tenantLabel", () => {
  const P = "wikigit.org";
  it("extracts a subdomain label", () => {
    expect(tenantLabel("recipes.wikigit.org", P)).toBe("recipes");
  });
  it("treats the apex and www as the flagship (empty label)", () => {
    expect(tenantLabel("wikigit.org", P)).toBe("");
    expect(tenantLabel("www.wikigit.org", P)).toBe("www");
  });
  it("ignores a port and trailing dot", () => {
    expect(tenantLabel("recipes.wikigit.org:443.", P)).toBe("recipes");
  });
  it("returns null for a host outside the platform domain", () => {
    expect(tenantLabel("bob.github.io", P)).toBeNull();
  });
  it("derives the base from the host when PLATFORM_HOST is unset", () => {
    expect(tenantLabel("foo.example.com", "")).toBe("foo");
  });
});

describe("validName", () => {
  it("accepts a normal label, rejects reserved + malformed", () => {
    expect(validName("recipes")).toBe(true);
    expect(validName("api")).toBe(false); // reserved
    expect(validName("-bad")).toBe(false); // leading hyphen
    expect(validName("UPPER")).toBe(false); // not lowercased
    expect(validName("")).toBe(false);
  });
});

describe("resolveHost", () => {
  it("resolves a registered subdomain to its repo", async () => {
    expect(await resolveHost(env(LINES), "recipes.wikigit.org")).toEqual({
      name: "recipes",
      repo: "bob/cookbook",
      lane: "byo",
    });
  });
  it("resolves apex + www to the operator flagship repo", async () => {
    const r = await resolveHost(env(LINES), "wikigit.org");
    expect(r).toEqual({ name: "", repo: "mde-pach/wiki-n-go", lane: "platform" });
    expect((await resolveHost(env(LINES), "www.wikigit.org"))?.repo).toBe(
      "mde-pach/wiki-n-go",
    );
  });
  it("returns null for an unregistered subdomain", async () => {
    expect(await resolveHost(env(LINES), "ghost.wikigit.org")).toBeNull();
  });
  it("returns null for a reserved subdomain (never a wiki)", async () => {
    expect(await resolveHost(env(LINES), "api.wikigit.org")).toBeNull();
  });
});

describe("nameAvailability", () => {
  it("flags taken, reserved, invalid, and free names", async () => {
    expect((await nameAvailability(env(LINES), "recipes")).available).toBe(false);
    expect((await nameAvailability(env(LINES), "recipes")).reason).toBe("taken");
    expect((await nameAvailability(env(LINES), "api")).reason).toBe("reserved");
    expect((await nameAvailability(env(LINES), "-x")).reason).toBe("invalid");
    expect((await nameAvailability(env(LINES), "fresh")).available).toBe(true);
  });
});
