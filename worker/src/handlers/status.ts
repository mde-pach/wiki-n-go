import { repoInstallationId, usingApp } from "../githubApp";
import { authStatus } from "../identity/auth";
import { multiTenant, requestedRepo } from "../tenant";
import type { Env } from "../types";

export interface StatusReport {
  ok: true;
  mode: "single" | "multi";
  repo: string;
  served: boolean; // is this repo actually served? (multi: App installed; single: always)
  signin: { enabled: boolean; providers: Record<string, boolean> };
  writeCredential: "app" | "token" | "none";
  appSlug: string | null; // for the setup page's "Connect" (install) link
  managed: boolean; // a platform-org repo → offer the "move to my GitHub" bridge
}

// Connection diagnostics for the setup/status page. Deliberately reachable even
// for an un-connected repo (it must be able to say "not connected → install the
// app"), so it does its OWN repo resolution and never throws the way the normal
// tenant gate does. Read-only; no write, no token.
export async function status(env: Env, request: Request): Promise<StatusReport> {
  const multi = multiTenant(env);
  const requested = (() => {
    try {
      return requestedRepo(request);
    } catch {
      return null;
    }
  })();
  const repo = (multi && requested) || { owner: env.REPO_OWNER, name: env.REPO_NAME };

  let served = true;
  if (multi) {
    try {
      served = Boolean(await repoInstallationId(env, repo.owner, repo.name));
    } catch {
      served = false;
    }
  }

  return {
    ok: true,
    mode: multi ? "multi" : "single",
    repo: `${repo.owner}/${repo.name}`,
    served,
    signin: authStatus(env),
    writeCredential: usingApp(env) ? "app" : env.GITHUB_TOKEN ? "token" : "none",
    appSlug: env.GITHUB_APP_SLUG ?? null,
    managed: Boolean(env.PLATFORM_ORG) && repo.owner === env.PLATFORM_ORG,
  };
}
