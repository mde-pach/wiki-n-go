import { For, Show } from "solid-js";
import { fetchMarkdown } from "../lib/content";
import { pageSet } from "../lib/manifest";
import { splitTitle } from "../lib/markdown";
import { prettify, readHref, slugifyLabel } from "../lib/paths";
import { clientResource } from "../lib/solid";
import { Status, ViewHead } from "./ui";

const SCAN_CAP = 300;

interface Member {
  slug: string;
  title: string;
}

async function membersOf(cat: string): Promise<Member[]> {
  const slugs = [...(await pageSet())].slice(0, SCAN_CAP);
  const pages = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const raw = await fetchMarkdown(slug);
        const { title, meta } = splitTitle(raw);
        const tags = meta.tags ?? [];
        return tags.some((t) => slugifyLabel(t) === cat)
          ? { slug, title: title || prettify(slug) }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return pages
    .filter((p): p is Member => p !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export default function CategoryList(props: { cat?: string }) {
  const cat = () => props.cat ?? "";
  const members = clientResource(cat, membersOf);
  const label = () => prettify(cat());

  return (
    <main id="main" class="view-wrap">
      <ViewHead
        title={<>Category: {label()}</>}
        sub={<>Pages tagged “{label()}”. Membership is read live.</>}
      />
      <Show when={members()} fallback={<Status>Scanning pages…</Status>}>
        <Show
          when={(members()?.length ?? 0) > 0}
          fallback={<Status>No pages in this category yet.</Status>}
        >
          <ul class="category-list">
            <For each={members()}>
              {(m) => (
                <li>
                  <a href={readHref(m.slug)}>{m.title}</a>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
