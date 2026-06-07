import { HttpError } from "../http";
import type { Env } from "../types";
import { discover } from "./oidc";

// Sign-in providers the Worker can consume. GitHub is plain OAuth2 (identity via
// api.github.com/user); Wikigit is standard OIDC against a configured issuer
// (e.g. a Logto instance) — identity via discovery → token → userinfo. Both
// converge on one verified identity; the commit author is the only place it
// surfaces, and neither stores raw PII.
export type ProviderId = "github" | "wikigit";

export interface OAuthIdentity {
  provider: ProviderId;
  login: string; // GitHub login OR Wikigit handle — the display name + key base
  id: number; // GitHub numeric id (for the no-reply email); 0 for Wikigit
  avatar: string;
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

const wikigit: Provider = {
  id: "wikigit",
  configured: (env) =>
    Boolean(env.WIKIGIT_ISSUER && env.WIKIGIT_CLIENT_ID && env.WIKIGIT_CLIENT_SECRET),
  async authorizeUrl(env, redirectUri, state) {
    const oidc = await discover(env.WIKIGIT_ISSUER as string);
    const u = new URL(oidc.authorization_endpoint);
    u.searchParams.set("client_id", env.WIKIGIT_CLIENT_ID as string);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid profile");
    u.searchParams.set("state", state);
    return u.toString();
  },
  async exchange(env, code, redirectUri) {
    const oidc = await discover(env.WIKIGIT_ISSUER as string);
    const tokenRes = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.WIKIGIT_CLIENT_ID as string,
        client_secret: env.WIKIGIT_CLIENT_SECRET as string,
      }),
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) throw new HttpError(502, "Sign-in exchange failed.");
    const uiRes = await fetch(oidc.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        Accept: "application/json",
      },
    });
    if (!uiRes.ok) throw new HttpError(502, "Could not read your Wikigit profile.");
    const u = (await uiRes.json()) as {
      sub: string;
      preferred_username?: string;
      username?: string;
      name?: string;
      picture?: string;
    };
    const handle = u.preferred_username || u.username || u.name || u.sub;
    return { provider: "wikigit", login: handle, id: 0, avatar: u.picture ?? "" };
  },
};

const PROVIDERS: Record<ProviderId, Provider> = { github, wikigit };

export function getProvider(id: string): Provider | null {
  return id === "github" || id === "wikigit" ? PROVIDERS[id] : null;
}

export function providerStatus(env: Env): Record<ProviderId, boolean> {
  return { github: github.configured(env), wikigit: wikigit.configured(env) };
}
