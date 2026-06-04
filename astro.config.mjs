import solid from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Project site at https://<owner>.github.io/<repo>/. Custom domain: drop `base`.
export default defineConfig({
  site: "https://mde-pach.github.io",
  base: "/wiki-n-go",
  integrations: [solid()],
  vite: { plugins: [tailwindcss()] },
});
