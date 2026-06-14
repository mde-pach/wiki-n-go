import { postJson } from "./api";

// Custom-domain helper (BYO). Asks the Engine to attach a verified host to this
// wiki; the Engine checks ownership + the CNAME before recording it. See
// worker/src/handlers/domain.ts.
export function addCustomDomain(
  name: string,
  domain: string,
): Promise<{ ok: true; domain: string; url: string }> {
  return postJson("/domain", { name, domain });
}
