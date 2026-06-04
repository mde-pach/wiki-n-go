import { onMount } from "solid-js";
import { config } from "../config";

export default function Discussion() {
  const g = config.giscus;
  if (!g.repoId) return null;

  let container: HTMLDivElement | undefined;
  onMount(() => {
    if (!container) return;
    const attrs: Record<string, string> = {
      "data-repo": g.repo,
      "data-repo-id": g.repoId,
      "data-category": g.category,
      "data-category-id": g.categoryId,
      "data-mapping": "pathname",
      "data-reactions-enabled": "1",
      "data-input-position": "bottom",
      "data-theme": "light",
      "data-lang": "en",
    };
    const s = document.createElement("script");
    s.src = "https://giscus.app/client.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    container.appendChild(s);
  });

  return <section class="discussion" ref={container} />;
}
