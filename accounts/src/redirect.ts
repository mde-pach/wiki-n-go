// The federation root: a redirect_uri is accepted only on this host or a
// subdomain of it (matches the `*.wikigit.org` allowlist). Configurable so a
// fork can run its own federation; defaults to wikigit.org.
const ALLOWED_REDIRECT_HOST = process.env.ALLOWED_REDIRECT_HOST ?? "wikigit.org";

// Whether OpenAuth may deliver an authorization code to this redirect_uri.
// Unrestricted acceptance is an open redirect: the code is handed to redirect_uri,
// so any site could harvest a victim's code and take over the account (PKCE does
// not help — the attacker is the flow initiator). https only, apex or subdomain,
// plus http://localhost for dev.
export function isAllowedRedirect(redirectURI: string): boolean {
  let u: URL;
  try {
    u = new URL(redirectURI);
  } catch {
    return false;
  }
  if (u.protocol === "http:" && u.hostname === "localhost") return true;
  if (u.protocol !== "https:") return false;
  return (
    u.hostname === ALLOWED_REDIRECT_HOST ||
    u.hostname.endsWith(`.${ALLOWED_REDIRECT_HOST}`)
  );
}
