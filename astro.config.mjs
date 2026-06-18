import solid from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

// Project site at https://<owner>.github.io/<repo>/. The Pages workflow injects
// SITE_URL/BASE_PATH from the repo context; the fallbacks keep local builds and
// this repo working. Custom domain: set BASE_PATH=/ (or a repo var).
export default defineConfig({
  site: process.env.SITE_URL || "https://mde-pach.github.io",
  base: process.env.BASE_PATH || "/wiki-n-go",
  integrations: [solid()],
});
