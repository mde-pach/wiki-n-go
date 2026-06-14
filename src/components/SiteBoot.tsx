import { loadSiteConfig } from "../lib/site-config";

// Apply the owner's runtime config to the shared build's chrome. One static build
// serves every tenant, so the title/description are baked generic and corrected
// here once wikigit.json loads. A no-op on the flagship (config == defaults).
// Deeper chrome (wordmark, pre-paint theme, language set) is a follow-up.
export default function SiteBoot() {
  loadSiteConfig().then((c) => {
    if (c.title && c.title !== "Wikigit") {
      document.title = document.title.replace(/Wikigit$/, c.title);
    }
    if (c.description) setMeta("description", c.description);
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
