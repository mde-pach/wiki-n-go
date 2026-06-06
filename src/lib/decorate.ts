import { pageSet } from "./manifest";
import { BASE, langOf, resolveWikiSlug } from "./paths";
import { attachPagePreviews } from "./previews";

export type DecorateContext = { slug: string };

export async function decorate(root: HTMLElement, ctx: DecorateContext): Promise<void> {
  addSectionEditLinks(root, ctx.slug);
  makeSectionsCollapsible(root);
  attachCiteTooltips(root);
  attachPagePreviews(root);
  await markRedLinks(root, langOf(ctx.slug));
  void renderMermaid(root);
  document.dispatchEvent(new CustomEvent("wiki:rendered"));
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
    const a = document.createElement("a");
    a.className = "section-edit";
    a.textContent = "edit";
    a.href = `${BASE}/edit/${slug}?section=${encodeURIComponent(h.id)}`;
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
    if (h.querySelector(".section-toggle")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "section-toggle";
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", `Toggle the “${h.textContent?.trim()}” section`);
    btn.addEventListener("click", () => {
      const open = collapsed.has(h.id);
      if (open) collapsed.delete(h.id);
      else collapsed.add(h.id);
      btn.setAttribute("aria-expanded", String(open));
      h.classList.toggle("is-collapsed", !open);
      apply();
    });
    h.prepend(btn);
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
    a.setAttribute("href", `${BASE}/${slug}`);
    a.classList.toggle("is-red", red);
    if (red) a.title = "Page does not exist yet — click to create";
    else a.removeAttribute("title");
  }
}
