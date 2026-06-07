import { HttpError } from "../http";

// The three OIDC endpoints we use, pulled from the issuer's discovery document.
// We don't verify the id_token's signature: the token comes straight from the
// token endpoint over TLS, and we read identity from userinfo, so JWKS isn't on
// the critical path.
export interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

// Endpoints are stable per issuer, so cache them for the isolate's lifetime.
const cache = new Map<string, OidcEndpoints>();

export async function discover(issuer: string): Promise<OidcEndpoints> {
  const base = issuer.replace(/\/+$/, "");
  const hit = cache.get(base);
  if (hit) return hit;
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new HttpError(502, "Could not reach the identity provider.");
  const cfg = (await res.json()) as Partial<OidcEndpoints>;
  if (!cfg.authorization_endpoint || !cfg.token_endpoint || !cfg.userinfo_endpoint)
    throw new HttpError(502, "Invalid identity-provider configuration.");
  const endpoints: OidcEndpoints = {
    authorization_endpoint: cfg.authorization_endpoint,
    token_endpoint: cfg.token_endpoint,
    userinfo_endpoint: cfg.userinfo_endpoint,
  };
  cache.set(base, endpoints);
  return endpoints;
}
