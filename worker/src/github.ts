import { HttpError } from "./http";
import type { Env } from "./types";

export type GhInit = { method?: string; body?: string; allow404?: boolean };

export interface CommitItem {
  sha: string;
  parents: { sha: string }[];
  commit: { author: { name: string; date: string }; message: string };
}

export function ghAuth(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": `${env.REPO_NAME}-worker`,
  };
}

export function ghHeaders(env: Env): Record<string, string> {
  return {
    ...ghAuth(env),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function gh<T = unknown>(
  env: Env,
  path: string,
  init: GhInit = {},
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method,
    body: init.body,
    headers: ghHeaders(env),
  });
  if (res.status === 404 && init.allow404) return undefined as T;
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T; // e.g. DELETE a ref → no body
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function ghGraphQL<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...ghAuth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new HttpError(502, `GitHub GraphQL ${res.status}`);
  const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (data.errors?.length) throw new HttpError(502, data.errors[0].message);
  if (!data.data) throw new HttpError(502, "GraphQL returned no data");
  return data.data;
}

// A JSON config file from the repo root (bans/trusted-editors/filters/protection).
export async function repoJson<T>(env: Env, file: string): Promise<T | null> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${env.BRANCH}/${file}`,
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
