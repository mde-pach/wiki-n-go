import { HttpError } from "../http";
import type { Env } from "../types";

// Sign-in providers the Worker can consume. GitHub is plain OAuth2 (identity via
// api.github.com/user); Wikigit is our OpenAuth issuer (the `accounts/` Worker) —
// a standard OAuth2 code flow whose access token is a JWT we verify via the
// issuer's JWKS. Both converge on one verified identity; the commit author is the
// only place it surfaces, and neither stores raw PII.
export type ProviderId = "github" | "wikigit";

export interface OAuthIdentity {
  provider: ProviderId;
  login: string; // GitHub login OR Wikigit handle — the display name
  id: number; // GitHub numeric id (for the no-reply email); 0 for Wikigit
  avatar: string;
  sub?: string; // stable unique id (Wikigit) — the `wg:` key base, survives handle changes
}

export interface Provider {
  id: ProviderId;
  configured(env: Env): boolean;
  authorizeUrl(env: Env, redirectUri: string, state: string): Promise<string>;
  exchange(env: Env, code: string, redirectUri: string): Promise<OAuthIdentity>;
}

const github: Provider = {
  id: "github",
  configured: (env) => Boolean(env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET),
  authorizeUrl(env, redirectUri, state) {
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", env.OAUTH_CLIENT_ID as string);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", "read:user");
    u.searchParams.set("state", state);
    return Promise.resolve(u.toString());
  },
  async exchange(env, code, redirectUri) {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.OAUTH_CLIENT_ID,
        client_secret: env.OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) throw new HttpError(502, "Sign-in exchange failed.");
    // Use the token once to read the verified identity, then discard it.
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": `${env.REPO_NAME}-worker`,
      },
    });
    if (!userRes.ok) throw new HttpError(502, "Could not read your GitHub profile.");
    const u = (await userRes.json()) as {
      login: string;
      id: number;
      avatar_url: string;
    };
    return { provider: "github", login: u.login, id: u.id, avatar: u.avatar_url };
  },
};

// A public OAuth2 client (no secret): the issuer's redirect_uri allowlist is the
// protection. The issuer echoes our signed `state`, so we build the authorize URL
// ourselves and use the OpenAuth client only for token exchange + JWKS
// verification — lazy-imported so it never enters the base bundle unless a
// Wikigit sign-in actually runs.
const wikigit: Provider = {
  id: "wikigit",
  configured: (env) => Boolean(env.WIKIGIT_ISSUER && env.WIKIGIT_CLIENT_ID),
  authorizeUrl(env, redirectUri, state) {
    const issuer = (env.WIKIGIT_ISSUER as string).replace(/\/+$/, "");
    const u = new URL(`${issuer}/authorize`);
    u.searchParams.set("client_id", env.WIKIGIT_CLIENT_ID as string);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("state", state);
    return Promise.resolve(u.toString());
  },
  async exchange(env, code, redirectUri) {
    const [{ createClient }, { createSubjects }, { object, string }] =
      await Promise.all([
        import("@openauthjs/openauth/client"),
        import("@openauthjs/openauth/subject"),
        import("valibot"),
      ]);
    const subjects = createSubjects({
      user: object({ id: string(), email: string(), handle: string() }),
    });
    const client = createClient({
      clientID: env.WIKIGIT_CLIENT_ID as string,
      issuer: env.WIKIGIT_ISSUER as string,
    });
    const exchanged = await client.exchange(code, redirectUri);
    if (exchanged.err) throw new HttpError(502, "Sign-in exchange failed.");
    const verified = await client.verify(subjects, exchanged.tokens.access);
    if (verified.err)
      throw new HttpError(502, "Could not verify your Wikigit identity.");
    const { id, handle } = verified.subject.properties;
    return { provider: "wikigit", login: handle, id: 0, avatar: "", sub: id };
  },
};

const PROVIDERS: Record<ProviderId, Provider> = { github, wikigit };

export function getProvider(id: string): Provider | null {
  return id === "github" || id === "wikigit" ? PROVIDERS[id] : null;
}

export function providerStatus(env: Env): Record<ProviderId, boolean> {
  return { github: github.configured(env), wikigit: wikigit.configured(env) };
}
