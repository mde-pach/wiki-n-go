import { config } from "../config";
import { activeRepo } from "./engine";
import { engineFetch } from "./tenant";

// Connection status from the Engine's /status endpoint (see worker handlers/status).
export interface EngineStatus {
  ok: boolean;
  mode: "single" | "multi";
  repo: string;
  served: boolean;
  signin: { enabled: boolean; providers: Record<string, boolean> };
  writeCredential: "app" | "token" | "none";
  appSlug: string | null;
  managed?: boolean; // managed (platform-org) repo → offer the transfer bridge
}

// Fetch the Engine's self-report. Returns null when the backend is unreachable —
// the setup page renders that as the "can't reach the backend" state.
export async function fetchEngineStatus(): Promise<EngineStatus | null> {
  if (!config.workerUrl) return null;
  try {
    const res = await engineFetch("/status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as EngineStatus;
  } catch {
    return null;
  }
}

// One-click "Connect" — installs the Wikigit GitHub App on the user's repo, which
// is what tells the multi-tenant Engine to serve it. Null when no App slug is
// configured (the page then shows manual guidance instead of a button).
export function appInstallUrl(slug?: string | null): string | null {
  const s = slug || config.githubAppSlug;
  return s ? `https://github.com/apps/${s}/installations/new` : null;
}

export const repoUrl = (): string => {
  const { owner, name } = activeRepo();
  return `https://github.com/${owner}/${name}`;
};

export const pagesSettingsUrl = (): string => `${repoUrl()}/settings/pages`;

// Is this reader using the operator-run hosted Engine, or a self-hosted one?
export const usingHostedBackend = (): boolean => config.hostedBackend;
