import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../identity/auth";
import { MemoryKV } from "../store";
import type { Env } from "../types";
import { transfer, transferComplete } from "./transfer";

afterEach(() => vi.unstubAllGlobals());

const SECRET = "session-secret";
const REGISTRY = [
  JSON.stringify({
    name: "acme",
    repo: "wikigit-tenants/acme",
    owner: "gh:jane",
    lane: "platform",
    at: "t1",
  }),
  JSON.stringify({
    name: "recipes",
    repo: "jane/cook",
    owner: "gh:jane",
    lane: "byo",
    at: "t2",
  }),
].join("\n");

function env(): Env {
  const kv = new MemoryKV();
  kv.put("registry:raw", REGISTRY); // readRegistry serves from cache → no GitHub
  return {
    REPO_OWNER: "op",
    REPO_NAME: "hub",
    PLATFORM_HOST: "wikigit.org",
    PLATFORM_ORG: "wikigit-tenants",
    GITHUB_PLATFORM_APP_ID: "1",
    GITHUB_PLATFORM_APP_PRIVATE_KEY: "key",
    SESSION_SECRET: SECRET,
    RATE_LIMIT: kv,
  } as unknown as Env;
}

async function req(login: string | null): Promise<Request> {
  const headers = new Headers();
  if (login) {
    const jwt = await signSession(SECRET, { login, id: 1, avatar: "" });
    headers.set("Authorization", `Bearer ${jwt}`);
  }
  return new Request("https://api.wikigit.org/transfer", { method: "POST", headers });
}

// These all return BEFORE the GitHub transfer / install check (which need App
// JWTs), so no network stub is required — they exercise validation + ownership.
describe("transfer (initiate) guards", () => {
  it("rejects an invalid GitHub username", async () => {
    await expect(
      transfer(env(), await req("jane"), { name: "acme", target: "bad name!" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires a session", async () => {
    await expect(
      transfer(env(), await req(null), { name: "acme", target: "jane" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("forbids moving a wiki you don't own", async () => {
    await expect(
      transfer(env(), await req("bob"), { name: "acme", target: "bob" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to move a non-managed (byo) wiki", async () => {
    await expect(
      transfer(env(), await req("jane"), { name: "recipes", target: "jane" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("404s an unknown wiki", async () => {
    await expect(
      transfer(env(), await req("jane"), { name: "ghost", target: "jane" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("transferComplete guards", () => {
  it("rejects an invalid target", async () => {
    await expect(
      transferComplete(env(), await req("jane"), { name: "acme", target: "" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("forbids completing a move for a wiki you don't own", async () => {
    await expect(
      transferComplete(env(), await req("bob"), { name: "acme", target: "bob" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
