import solid from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

// Optional edge-SSR variant (off by default — see SPEC §8/M4). Set
// EDGE_SSR=cloudflare|netlify to server-render the content route on demand for
// SEO (real HTML + server-side noindex-until-patrolled), still fetching content
// from jsDelivr@sha at request time — no per-commit rebuild. Unset → pure static
// output for GitHub Pages, unchanged (no adapter, every route prerendered).
const edgeSsr = process.env.EDGE_SSR || "";
const loadAdapter = {
  // `imageService: "compile"` keeps sharp (→ node `fs`) out of the edge runtime
  // bundle; content images are plain Markdown, so no runtime image service.
  cloudflare: () =>
    import("@astrojs/cloudflare").then((m) => m.default({ imageService: "compile" })),
  netlify: () => import("@astrojs/netlify").then((m) => m.default()),
};
if (edgeSsr && !(edgeSsr in loadAdapter)) {
  throw new Error(`EDGE_SSR must be "cloudflare" or "netlify", got "${edgeSsr}".`);
}
const adapter = edgeSsr ? await loadAdapter[edgeSsr]() : undefined;

// Render only the content route on demand; every other page stays prerendered.
// Done from config (not an `export const prerender` in the page) so the same
// page file prerenders byte-for-byte unchanged when EDGE_SSR is unset.
const onDemandContent = {
  name: "wikigit:edge-ssr",
  hooks: {
    "astro:route:setup": ({ route }) => {
      if (route.component === "src/pages/[...slug].astro") route.prerender = false;
    },
  },
};

// Project site at https://<owner>.github.io/<repo>/. The Pages workflow injects
// SITE_URL/BASE_PATH from the repo context; the fallbacks keep local builds and
// this repo working. Custom domain: set BASE_PATH=/ (or a repo var).
export default defineConfig({
  site: process.env.SITE_URL || "https://mde-pach.github.io",
  base: process.env.BASE_PATH || "/wiki-n-go",
  adapter,
  integrations: [solid(), ...(adapter ? [onDemandContent] : [])],
});
