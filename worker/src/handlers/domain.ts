import { HttpError } from "../http";
import { sessionIdentity } from "../identity/auth";
import { readRegistry, setTenantDomain, validDomain } from "../registry";
import { botCommitter } from "../repo";
import type { Env } from "../types";
import { ownerKey } from "./claim";

// Custom-domain helper (BYO): let an owner serve their wiki at `wiki.mybrand.com`.
// The Engine only records a domain once it's both owned (registry `owner`) and
// DNS-verified (a CNAME pointing at the tenant's platform host), so a host can't
// be hijacked into resolving to someone else's repo. Issuing the TLS certificate
// for the host is a separate infra step (Traefik per-domain HTTP-01) — see SPEC.

export interface DomainBody {
  name?: unknown; // the tenant's subdomain label
  domain?: unknown; // the custom host to attach
}

// The CNAME target we require: the tenant's own platform host. Verifying it proves
// the requester controls the domain's DNS (they pointed it at us) and tells us
// where the cert/proxy should terminate.
export function cnameExpected(env: Env, name: string): string {
  return `${name}.${env.PLATFORM_HOST}`.toLowerCase();
}

export function cnameOk(target: string | null, expected: string): boolean {
  if (!target) return false;
  const t = target.replace(/\.$/, "").toLowerCase();
  return t === expected;
}

// Resolve the domain's CNAME via DNS-over-HTTPS (no resolver dependency in the
// runtime). Returns the target host, or null when there's no CNAME.
async function cnameTarget(domain: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    return data.Answer?.find((a) => a.type === 5)?.data ?? null;
  } catch {
    return null;
  }
}

export async function addDomain(
  env: Env,
  request: Request,
  body: DomainBody,
): Promise<{ ok: true; domain: string; url: string }> {
  const name = String(body.name ?? "");
  const domain = String(body.domain ?? "").toLowerCase();
  if (!validDomain(domain))
    throw new HttpError(400, "Enter a valid domain like wiki.mybrand.com.");

  const session = await sessionIdentity(env, request);
  if (!session) throw new HttpError(401, "Sign in to add a domain.");
  const tenant = (await readRegistry(env)).get(name);
  if (!tenant) throw new HttpError(404, "No such wiki.");
  if (tenant.owner !== ownerKey(session))
    throw new HttpError(403, "Only the wiki's owner can add a domain.");

  const expected = cnameExpected(env, name);
  if (!cnameOk(await cnameTarget(domain), expected))
    throw new HttpError(
      400,
      `Point ${domain} at ${expected} with a CNAME record first, then verify.`,
    );

  await setTenantDomain(
    env,
    { ...tenant, domain, at: new Date().toISOString() },
    botCommitter(env),
  );
  return { ok: true, domain, url: `https://${domain}` };
}
