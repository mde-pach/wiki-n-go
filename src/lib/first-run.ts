import { listEditors } from "./admin";
import { getLinkGraph } from "./linkgraph";
import { BASE, settingsHref } from "./paths";
import { fetchEngineStatus } from "./setup-status";
import { loadSiteConfig } from "./site-config";

// Guided first-run: a self-completing checklist for a freshly created/connected
// wiki. Each item ticks off from live state (pages, editors, sign-in), so it's a
// status view, not a stored to-do — nothing to persist, nothing to mark done.

export interface FirstRunState {
  pages: number; // content pages known to the live link graph (home seed = 1)
  maintainers: number; // config maintainers ∪ granted editors
  signinAvailable: boolean; // a sign-in provider is enabled
}

interface ChecklistItem {
  done: boolean;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

// Pure: the three first-run steps, each resolved against live state. Done items
// drop their call-to-action (nothing left to do); pending items keep it.
export function buildChecklist(s: FirstRunState): ChecklistItem[] {
  return [
    {
      done: s.pages > 1,
      title: "Write your first page",
      detail:
        s.pages > 1
          ? "Nice — your wiki has more than its home page now."
          : "Your wiki starts with just a home page. Add your first article.",
      action: s.pages > 1 ? undefined : { label: "Create a page", href: `${BASE}/new` },
    },
    {
      done: s.maintainers > 0,
      title: "Invite an editor",
      detail:
        s.maintainers > 0
          ? "A maintainer can help look after the wiki with you."
          : "Anyone can already edit. Add a maintainer to help moderate and manage settings.",
      action:
        s.maintainers > 0
          ? undefined
          : { label: "Add a maintainer", href: settingsHref },
    },
    {
      done: s.signinAvailable,
      title: "Set who can edit",
      detail: s.signinAvailable
        ? "Sign-in is available, so editors can be identified. Tune page protection any time."
        : "Edits are anonymous-only. Decide who can edit and how pages are protected.",
      action: { label: "Open settings", href: settingsHref },
    },
  ];
}

// Gather the live signals. Every source is best-effort: a wiki that's mid-setup
// (no editors granted, backend hiccup) just shows the corresponding step pending.
export async function fetchFirstRunState(): Promise<FirstRunState> {
  const [graph, cfg, status, editors] = await Promise.all([
    getLinkGraph().catch(() => null),
    loadSiteConfig().catch(() => null),
    fetchEngineStatus().catch(() => null),
    listEditors().catch(() => ({ editors: [] as string[], owner: "" })),
  ]);
  const pages = graph ? Object.keys(graph.titles).length : 0;
  const maintainers = Math.max(cfg?.maintainers?.length ?? 0, editors.editors.length);
  const signinAvailable = status
    ? Object.values(status.signin.providers).some(Boolean)
    : false;
  return { pages, maintainers, signinAvailable };
}
