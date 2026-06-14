import { postJson } from "./api";

// The "move to my own GitHub" bridge (managed lane only). Two steps because the
// GitHub transfer must be accepted by the new owner out-of-band: start initiates
// it; finish re-points the subdomain once the owner has accepted and installed
// the Wikigit app on the moved repo. See worker/src/handlers/transfer.ts.

export function startTransfer(
  name: string,
  target: string,
): Promise<{ ok: true; pending: true; newRepo: string }> {
  return postJson("/transfer", { name, target });
}

export function finishTransfer(
  name: string,
  target: string,
): Promise<{ ok: true; repo: string; url: string }> {
  return postJson("/transfer/complete", { name, target });
}
