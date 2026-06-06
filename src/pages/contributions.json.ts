import type { APIRoute } from "astro";
import { gitContributions } from "../lib/git";

// Static per-author contributions index built from local git at build time —
// the no-Worker fallback for the profile contributions panel. Mirrors
// link-graph.json: emitted once per build, fetched only when the Worker is absent.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(gitContributions()), {
    headers: { "content-type": "application/json" },
  });
