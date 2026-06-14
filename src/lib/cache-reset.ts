// Module-level fetch caches (manifest/pageSet, history, page previews) are keyed
// by slug, not by commit SHA. Across an in-site edit + ClientRouter navigation
// (no full reload) they'd otherwise keep serving the pre-edit slug set, revision
// list and hovercards on every other page — a freshly created page stays a red
// link, search/backlinks stay stale. Reset every registered cache when the router
// swaps the document, so the next page re-fetches.
type Reset = () => void;

const resets: Reset[] = [];
let wired = false;

export function onSwapReset(reset: Reset): void {
  resets.push(reset);
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("astro:after-swap", () => {
    for (const r of resets) r();
  });
}
