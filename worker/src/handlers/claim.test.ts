import { describe, expect, it } from "vitest";
import { MemoryKV } from "../store";
import type { Env } from "../types";
import { enforceClaimRate, maxWikisPerOwner, provisioningPaused } from "./claim";

describe("provisioningPaused (kill-switch)", () => {
  const at = (PROVISION_PAUSED?: string) => ({ PROVISION_PAUSED }) as Env;
  it("is off when unset, empty, '0' or 'false'", () => {
    expect(provisioningPaused(at())).toBe(false);
    expect(provisioningPaused(at(""))).toBe(false);
    expect(provisioningPaused(at("0"))).toBe(false);
    expect(provisioningPaused(at("false"))).toBe(false);
    expect(provisioningPaused(at("FALSE"))).toBe(false);
  });
  it("is on for any other truthy value", () => {
    expect(provisioningPaused(at("1"))).toBe(true);
    expect(provisioningPaused(at("true"))).toBe(true);
    expect(provisioningPaused(at("paused"))).toBe(true);
  });
});

describe("maxWikisPerOwner", () => {
  it("defaults to 5 when unset or invalid", () => {
    expect(maxWikisPerOwner({} as Env)).toBe(5);
    expect(maxWikisPerOwner({ MAX_WIKIS_PER_OWNER: "abc" } as Env)).toBe(5);
    expect(maxWikisPerOwner({ MAX_WIKIS_PER_OWNER: "0" } as Env)).toBe(5);
    expect(maxWikisPerOwner({ MAX_WIKIS_PER_OWNER: "-3" } as Env)).toBe(5);
  });
  it("honours a positive override", () => {
    expect(maxWikisPerOwner({ MAX_WIKIS_PER_OWNER: "20" } as Env)).toBe(20);
  });
});

describe("enforceClaimRate", () => {
  it("is inert without a RATE_LIMIT binding", async () => {
    await expect(enforceClaimRate({} as Env, "wg:jane")).resolves.toBeUndefined();
  });

  it("allows up to the window max, then throws 429", async () => {
    const env = { RATE_LIMIT: new MemoryKV() } as unknown as Env;
    for (let i = 0; i < 10; i++) await enforceClaimRate(env, "wg:jane");
    await expect(enforceClaimRate(env, "wg:jane")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("counts each identity separately", async () => {
    const env = { RATE_LIMIT: new MemoryKV() } as unknown as Env;
    for (let i = 0; i < 10; i++) await enforceClaimRate(env, "wg:jane");
    await expect(enforceClaimRate(env, "gh:bob")).resolves.toBeUndefined();
  });
});
