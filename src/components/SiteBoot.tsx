import { applyAppearance, applyWordmark, cacheChrome, chromeBits } from "../lib/chrome";
import { defaultSiteConfig, loadSiteConfig } from "../lib/site-config";

// Apply the owner's runtime config to the shared build's chrome. One static build
// serves every tenant, so the title / tagline / wordmark / Appearance defaults are
// baked generic and corrected here once wikigit.json loads. A no-op on the flagship
// (config == defaults), which keeps its hand-crafted "wiki·git" wordmark.
export default function SiteBoot() {
  if (typeof document === "undefined") return null; // build/SSR: keep baked chrome
  loadSiteConfig().then((c) => {
    const def = defaultSiteConfig();
    if (c.title && c.title !== def.title) {
      document.title = document.title.replace(/Wikigit$/, c.title);
    }
    if (c.description) setMeta("description", c.description);

    applyAppearance(document, c.appearance);

    const brandChanged = c.title !== def.title || c.tagline !== def.tagline;
    if (brandChanged) applyWordmark(document, c.title, c.tagline);

    const appearanceChanged =
      JSON.stringify(c.appearance) !== JSON.stringify(def.appearance);
    if (brandChanged || appearanceChanged) {
      cacheChrome(window.location.host, chromeBits(c));
    }
  });
  return null;
}

function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}
