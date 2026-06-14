import { HttpError } from "../http";
import { nameAvailability, type Resolution, resolveHost } from "../registry";
import type { Env } from "../types";

// The request host the frontend is asking about: an explicit `?host=` (what the
// browser passes from window.location), else the forwarded/real Host header.
function targetHost(request: Request, url: URL): string {
  return (
    url.searchParams.get("host") ??
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host") ??
    ""
  );
}

// Map a hosted address to the wiki it renders. 404 when the subdomain isn't a
// registered tenant, so the shared frontend can show a "claim this name" page.
export async function resolve(
  env: Env,
  request: Request,
  url: URL,
): Promise<Resolution> {
  const hit = await resolveHost(env, targetHost(request, url));
  if (!hit) throw new HttpError(404, "No wiki registered for this address.");
  return hit;
}

export async function tenantAvailable(env: Env, url: URL) {
  const name = url.searchParams.get("name") ?? "";
  return nameAvailability(env, name);
}
