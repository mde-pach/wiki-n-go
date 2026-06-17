import { fetchMarkdown, PageNotFoundError } from "./content";
import { splitTitle } from "./frontmatter";
import { pageSet } from "./manifest";
import { BASE, langOf, prettify, readHref, resolveWikiSlug, viewHref } from "./paths";
import { attachPagePreviews } from "./previews";

export type DecorateContext = { slug: string };

export async function decorate(root: HTMLElement, ctx: DecorateContext): Promise<void> {
  // Pull in `{{slug}}` transclusions first so the passes below (red links, cite
  // tooltips, previews, mermaid) cover the included content too.
  await expandTransclusions(root, ctx.slug);
  addSectionEditLinks(root, ctx.slug);
  makeSectionsCollapsible(root);
  attachCiteTooltips(root);
  attachPagePreviews(root);
  await markRedLinks(root, langOf(ctx.slug));
  void renderMermaid(root);
  document.dispatchEvent(new CustomEvent("wiki:rendered"));
}

// `{{slug}}` placeholders (see `lib/transclude`) are filled at read time from the
// CDN — no rebuild. Runs in passes so nested transclusions resolve, bounded by
// depth, skipping cycles (a page that transcludes one of its own ancestors).
const TRANSCLUDE_MAX_DEPTH = 4;

export async function expandTransclusions(
  root: HTMLElement,
  pageSlug: string,
): Promise<void> {
  for (let pass = 0; pass < TRANSCLUDE_MAX_DEPTH; pass++) {
    const pending = Array.from(
      root.querySelectorAll<HTMLElement>(".transclude[data-src]"),
    ).filter((n) => !n.dataset.done);
    if (pending.length === 0) return;
    await Promise.all(pending.map((n) => fillTransclude(n, pageSlug)));
  }
  for (const n of root.querySelectorAll<HTMLElement>(
    ".transclude[data-src]:not([data-done])",
  )) {
    n.dataset.done = "1";
    n.innerHTML = transcludeNote("Transclusion nesting is too deep to expand fully.");
  }
}

async function fillTransclude(node: HTMLElement, pageSlug: string): Promise<void> {
  node.dataset.done = "1";
  const slug = node.dataset.src;
  if (!slug) return;
  if (transcludeAncestors(node, pageSlug).includes(slug)) {
    node.innerHTML = transcludeNote(
      `Skipped a circular transclusion of “${prettify(slug)}”.`,
    );
    return;
  }
  try {
    const { body } = splitTitle(await loadTransclude(slug));
    // Only a page that actually transcludes needs the markdown engine on the
    // client — pull it on demand so the read path doesn't ship it eagerly.
    const { renderMarkdown } = await import("./markdown");
    node.innerHTML = renderMarkdown(body);
  } catch (e) {
    node.innerHTML =
      e instanceof PageNotFoundError
        ? `<div class="notice notice-warn">No page “${prettify(slug)}” to transclude. <a href="${BASE}/edit/${slug}">Create it →</a></div>`
        : transcludeNote(`Couldn't load “${prettify(slug)}”.`);
  }
}

// The slug chain from this placeholder up through any enclosing transclusions and
// the host page — used to break cycles.
function transcludeAncestors(node: HTMLElement, pageSlug: string): string[] {
  const slugs = [pageSlug];
  let p = node.parentElement?.closest<HTMLElement>(".transclude[data-src]") ?? null;
  while (p) {
    if (p.dataset.src) slugs.push(p.dataset.src);
    p = p.parentElement?.closest<HTMLElement>(".transclude[data-src]") ?? null;
  }
  return slugs;
}

function transcludeNote(text: string): string {
  return `<div class="notice notice-info">${text}</div>`;
}

// Dedupe fetches across nested/repeated transclusions in one view (and the
// per-page SHA resolve they each trigger); a transient failure drops out so it
// can retry. Same module-cache tradeoff as the hover previews.
const transcludeCache = new Map<string, Promise<string>>();
function loadTransclude(slug: string): Promise<string> {
  let p = transcludeCache.get(slug);
  if (!p) {
    p = fetchMarkdown(slug);
    transcludeCache.set(slug, p);
    p.catch(() => transcludeCache.delete(slug));
  }
  return p;
}

// Lazy-render ```mermaid blocks. Mermaid is heavy and only some pages use it, so
// it's a dynamic import loaded on demand — never in the base bundle. Diagram
// source is user content, so render under the strict (sanitizing) security level.
export async function renderMermaid(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>(
    "pre.mermaid:not([data-processed])",
  );
  if (blocks.length === 0) return;
  const { default: mermaid } = await import("mermaid");
  const dark = document.documentElement.dataset.theme === "dark";
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
  await mermaid.run({ nodes: Array.from(blocks), suppressErrors: true });
}

// Append a per-section `edit` link to each heading → opens the editor scoped
// to that section (Wikipedia's `[edit]` affordance).
export function addSectionEditLinks(root: HTMLElement, slug: string): void {
  const heads = root.querySelectorAll<HTMLElement>(":is(h2, h3)[id]");
  for (const h of heads) {
    if (h.querySelector(".section-edit")) continue;
    if (h.closest(".transclude")) continue; // transcluded headings edit their own page
    const a = document.createElement("a");
    a.className = "section-edit";
    a.textContent = "edit";
    a.href = `${viewHref("edit", slug)}?section=${encodeURIComponent(h.id)}`;
    h.appendChild(a);
  }
}

// Wikipedia-style show/hide per heading. A caret on each h2/h3/h4 toggles its
// section; visibility is recomputed from the full collapsed set each time so
// nesting works (collapsing an h2 also hides its h3s, independently of their
// own state). Sections start open so the TOC and anchor links keep working.
export function makeSectionsCollapsible(root: HTMLElement): void {
  const heads = root.querySelectorAll<HTMLElement>(":is(h2, h3, h4)[id]");
  if (heads.length === 0) return;
  const collapsed = new Set<string>();

  const apply = () => {
    const stack: { level: number; collapsed: boolean }[] = [];
    for (const el of Array.from(root.children) as HTMLElement[]) {
      const level = headingLevel(el);
      if (level) {
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        el.hidden = stack.some((s) => s.collapsed);
        stack.push({ level, collapsed: collapsed.has(el.id) });
      } else {
        el.hidden = stack.some((s) => s.collapsed);
      }
    }
  };

  for (const h of heads) {
    if (h.closest(".transclude")) continue; // transcluded sections aren't top-level here
    // The toggle is usually baked into the SSR HTML (no first-paint pop-in); we
    // just wire its click handler. Fall back to creating it if it's absent.
    let btn = h.querySelector<HTMLButtonElement>(".section-toggle");
    if (btn?.dataset.wired) continue;
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "section-toggle";
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", `Toggle the “${h.textContent?.trim()}” section`);
      h.prepend(btn);
    }
    const button = btn;
    button.dataset.wired = "1";
    button.addEventListener("click", () => {
      const open = collapsed.has(h.id);
      if (open) collapsed.delete(h.id);
      else collapsed.add(h.id);
      button.setAttribute("aria-expanded", String(open));
      h.classList.toggle("is-collapsed", !open);
      apply();
    });
  }
}

export function headingLevel(el: HTMLElement): number {
  const m = /^H([2-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
}

// Hover popover over a `[N]` citation marker showing the reference text.
export function attachCiteTooltips(root: HTMLElement): void {
  const refs = root.querySelectorAll<HTMLAnchorElement>("a.cite-ref");
  if (refs.length === 0) return;
  root.querySelector(".cite-tip")?.remove();

  const tip = document.createElement("div");
  tip.className = "cite-tip";
  tip.style.display = "none";
  root.appendChild(tip);
  let hideTimer: number | undefined;

  const show = (ref: HTMLAnchorElement) => {
    const id = ref.getAttribute("href")?.slice(1);
    const target = id ? root.querySelector(`#${CSS.escape(id)}`) : null;
    if (!target) return;
    const clone = target.cloneNode(true) as HTMLElement;
    clone.querySelector(".ref-backlink")?.remove();
    const text = clone.querySelector("p")?.innerHTML ?? clone.innerHTML;
    tip.innerHTML = `<span class="ct-num">${ref.textContent}.</span> ${text}`;
    tip.style.display = "block";
    const r = ref.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        r.left + r.width / 2 - tip.offsetWidth / 2,
        window.innerWidth - tip.offsetWidth - 8,
      ),
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${r.bottom + 8}px`;
  };
  const scheduleHide = () => {
    hideTimer = window.setTimeout(() => {
      tip.style.display = "none";
    }, 150);
  };
  const cancelHide = () => clearTimeout(hideTimer);

  for (const ref of refs) {
    ref.addEventListener("mouseenter", () => {
      cancelHide();
      show(ref);
    });
    ref.addEventListener("mouseleave", scheduleHide);
  }
  tip.addEventListener("mouseenter", cancelHide);
  tip.addEventListener("mouseleave", scheduleHide);
}

export async function markRedLinks(root: HTMLElement, lang: string): Promise<void> {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-slug]");
  if (links.length === 0) return;
  const pages = await pageSet();
  for (const a of links) {
    const base = a.dataset.slug;
    if (!base) continue;
    const { slug, red } = resolveWikiSlug(base, pages, lang);
    a.setAttribute("href", readHref(slug));
    a.classList.toggle("is-red", red);
    if (red) a.title = "Page does not exist yet — click to create";
    else a.removeAttribute("title");
  }
}
