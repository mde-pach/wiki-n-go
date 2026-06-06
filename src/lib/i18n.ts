import { config } from "../config";
import { parseFrontmatter } from "./frontmatter";
import { contentSlugs, rawPage } from "./pages";
import { langOf } from "./paths";

export interface LangLink {
  lang: string;
  name: string;
  slug: string;
  current: boolean;
}

const langName = (code: string) =>
  config.languages.find((l) => l.code === code)?.name ?? code;

// Parsed once from the eager content glob: every page that declares a
// translationKey, paired with it. Pages without a key aren't grouped.
let keyed: { slug: string; key: string }[] | null = null;
function keyedSlugs(): { slug: string; key: string }[] {
  if (!keyed) {
    keyed = [];
    for (const slug of contentSlugs()) {
      const raw = rawPage(slug);
      const key = raw ? parseFrontmatter(raw).meta.translationKey : undefined;
      if (key) keyed.push({ slug, key });
    }
  }
  return keyed;
}

// Build/SSR-only: the translation siblings of a page (including itself), ordered
// by the configured language list. Empty when the page declares no translationKey,
// so the switcher only appears for genuinely multilingual articles.
export function translations(slug: string): LangLink[] {
  const mine = keyedSlugs().find((p) => p.slug === slug);
  if (!mine) return [];
  const order = config.languages.map((l) => l.code);
  return keyedSlugs()
    .filter((p) => p.key === mine.key)
    .map((p) => {
      const lang = langOf(p.slug);
      return { lang, name: langName(lang), slug: p.slug, current: p.slug === slug };
    })
    .sort((a, b) => order.indexOf(a.lang) - order.indexOf(b.lang));
}
