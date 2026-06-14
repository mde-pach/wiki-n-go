import { describe, expect, it } from "vitest";
import { isMaintainer } from "./trust";

describe("isMaintainer (SEC-3: keyed on provider, not display name)", () => {
  const owner = "octocat";

  it("grants the owner via their GitHub key", () => {
    expect(isMaintainer("gh:octocat", owner, [])).toBe(true);
  });

  it("does NOT grant a Wikigit handle equal to the owner's login", () => {
    // The takeover: a self-chosen wg: handle "octocat" must not become owner.
    expect(isMaintainer("wg:12345", owner, [])).toBe(false);
  });

  it("does NOT grant an anon pseudonym that happens to equal the owner", () => {
    expect(isMaintainer("anon-octocat", owner, [])).toBe(false);
  });

  it("matches a granted anon key (entries are writer keys)", () => {
    expect(isMaintainer("anon-13ef295d", owner, ["anon-13ef295d"])).toBe(true);
  });

  it("reads a legacy bare-login entry as a GitHub key", () => {
    expect(isMaintainer("gh:alice", owner, ["alice"])).toBe(true);
    // …and does not let a Wikigit handle "alice" inherit that grant.
    expect(isMaintainer("wg:9", owner, ["alice"])).toBe(false);
  });

  it("matches an explicit provider-qualified entry", () => {
    expect(isMaintainer("wg:9", owner, ["wg:9"])).toBe(true);
    expect(isMaintainer("gh:bob", owner, ["gh:bob"])).toBe(true);
  });

  it("denies an unrelated identity", () => {
    expect(isMaintainer("anon-x", owner, ["gh:alice", "wg:9"])).toBe(false);
  });
});
