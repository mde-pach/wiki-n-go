import { onCleanup, onMount } from "solid-js";
import { config } from "../config";
import { getJson } from "../lib/api";

// noindex-until-patrolled: a page whose latest revision a maintainer hasn't
// patrolled gets a robots=noindex tag, so unreviewed edits don't get indexed.
// Client-side (the read path is static/CDN, no Worker) — JS-running crawlers
// honor it; it fails open, so a Worker hiccup never deindexes the wiki.
export default function PatrolMeta(props: { slug: string }) {
  if (!config.workerUrl) return null;

  let el: HTMLMetaElement | undefined;
  onMount(async () => {
    try {
      const { patrolled } = await getJson<{ patrolled: boolean }>(
        `/patrol-status?slug=${encodeURIComponent(props.slug)}`,
      );
      if (patrolled) return;
      el = document.createElement("meta");
      el.name = "robots";
      el.content = "noindex";
      el.dataset.patrol = "1";
      document.head.appendChild(el);
    } catch {}
  });
  onCleanup(() => el?.remove());
  return null;
}
