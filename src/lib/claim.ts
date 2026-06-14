import { getJson, postJson } from "./api";

export interface Availability {
  name: string;
  available: boolean;
  reason?: "invalid" | "reserved" | "taken";
}

export function checkName(name: string): Promise<Availability> {
  return getJson<Availability>(`/tenant-available?name=${encodeURIComponent(name)}`);
}

export interface ClaimResult {
  ok: true;
  name: string;
  repo: string;
  lane: "platform" | "byo";
  url: string;
}

export function createWiki(body: {
  name: string;
  lane: "platform" | "byo";
  repo?: string;
}): Promise<ClaimResult> {
  return postJson<ClaimResult>("/claim", body);
}
