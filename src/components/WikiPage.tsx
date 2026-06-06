import { createSignal, onMount, Show } from "solid-js";
import {
  fetchMarkdown,
  fetchMarkdownAt,
  PageNotFoundError,
  renderMarkdown,
} from "../lib/content";
import type { PageMeta } from "../lib/frontmatter";
import { pageSet } from "../lib/manifest";
import { emphasizeLeadHtml, splitTitle } from "../lib/markdown";
import { BASE, prettify, readHref } from "../lib/paths";
import { attachPagePreviews } from "../lib/previews";
import { slugFromLocation } from "../lib/slug";
import { errMessage } from "../lib/util";
import { Icons } from "./Icons";

export default function WikiPage(props: {
  slug?: string;
  initialHtml?: string;
  initialRaw?: string;
  meta?: PageMeta;
}) {
  const slug = () => props.slug ?? slugFromLocation();
  const [html, setHtml] = createSignal(props.initialHtml);
  const [meta, setMeta] = createSignal<PageMeta>(props.meta ?? {});
  const [notFound, setNotFound] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const [redirectedFrom, setRedirectedFrom] = createSignal<string>();
  const [revOf, setRevOf] = createSignal<string>();
  let body: HTMLDivElement | undefined;

  // Render this page pinned to a historic commit (permalink to a revision).
  async function showRevision(rev: string) {
    try {
      const {
        title,
        body: b,
        meta: fresh,
      } = splitTitle(await fetchMarkdownAt(slug(), rev));
      setMeta(fresh);
      setHtml(emphasizeLeadHtml(renderMarkdown(b), title));
      setRevOf(rev);
      queueMicrotask(decorate);
    } catch (e) {
      setErr(errMessage(e));
    }
  }

  async function decorate() {
    if (!body) return;
    addSectionEditLinks(body, slug());
    makeSectionsCollapsible(body);
    attachCiteTooltips(body);
    attachPagePreviews(body);
    await markRedLinks(body);
    document.dispatchEvent(new CustomEvent("wiki:rendered"));
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    setRedirectedFrom(params.get("redirectedfrom") ?? undefined);
    if (html()) decorate(); // server-rendered content: build the TOC + red links now
    const rev = params.get("rev");
    if (rev) return showRevision(rev); // historical view; skip the latest fetch
    try {
      const raw = await fetchMarkdown(slug());
      if (raw === props.initialRaw) return; // unchanged since build → keep SSR content (no shift)
      const { title, body, meta: fresh } = splitTitle(raw);
      setMeta(fresh);
      setHtml(emphasizeLeadHtml(renderMarkdown(body), title));
      const heading = title || slug();
      document.title = heading;
      const el = document.querySelector(".page-title");
      if (el) el.textContent = heading;
      queueMicrotask(decorate);
    } catch (e) {
      if (props.initialHtml) return; // page existed at build; keep it on a transient error
      if (e instanceof PageNotFoundError) setNotFound(true);
      else setErr(errMessage(e));
    }
  });

  return (
    <article class="prose article">
      <Show
        when={!notFound() && !err()}
        fallback={
          <div class="wiki-status">
            <Show when={notFound()} fallback={`Could not load this page: ${err()}`}>
              No page named “{slug()}” yet.{" "}
              <a href={`${BASE}/edit/${slug()}`}>Create it →</a>
            </Show>
          </div>
        }
      >
        <Show when={revOf()}>
          {(rev) => (
            <div class="notice notice-warn">
              <Icons.Info />
              <span>
                You're viewing an old revision (as of{" "}
                <span class="mono">{rev().slice(0, 7)}</span>
                ). <a href={readHref(slug())}>View the current version</a>.
              </span>
            </div>
          )}
        </Show>
        <Show when={redirectedFrom()}>
          {(from) => (
            <div class="redirect-note">
              Redirected from{" "}
              <a href={`${BASE}/${from()}?redirect=no`}>{prettify(from())}</a>
            </div>
          )}
        </Show>
        <Show when={meta().hatnote}>
          <div class="hatnote">{meta().hatnote}</div>
        </Show>
        <Show when={meta().banner}>
          {(banner) => (
            <div class={`notice notice-${banner().kind ?? "info"}`}>
              <Show when={banner().kind === "warn"} fallback={<Icons.Info />}>
                <Icons.Warn />
              </Show>
              <span>{banner().text}</span>
            </div>
          )}
        </Show>
        <Show when={html()} fallback={<ArticleSkeleton />}>
          <div
            ref={(el) => {
              body = el;
            }}
            innerHTML={html()}
          />
        </Show>
      </Show>
    </article>
  );
}

function ArticleSkeleton() {
  return (
    <div class="sk-article" aria-hidden="true">
      <div
        class="sk-bar skeleton"
        style={{ height: "2.1rem", width: "55%", "margin-bottom": "0.6rem" }}
      />
      <div class="sk-bar skeleton" style={{ width: "94%" }} />
      <div class="sk-bar skeleton" style={{ width: "89%" }} />
      <div class="sk-bar skeleton" style={{ width: "92%" }} />
      <div class="sk-bar skeleton" style={{ width: "38%" }} />
    </div>
  );
}

// Append a per-section `edit` link to each heading → opens the editor scoped
// to that section (Wikipedia's `[edit]` affordance).
function addSectionEditLinks(root: HTMLElement, slug: string): void {
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
function makeSectionsCollapsible(root: HTMLElement): void {
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

function headingLevel(el: HTMLElement): number {
  const m = /^H([2-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
}

// Hover popover over a `[N]` citation marker showing the reference text.
function attachCiteTooltips(root: HTMLElement): void {
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

async function markRedLinks(root: HTMLElement): Promise<void> {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-slug]");
  if (links.length === 0) return;
  const pages = await pageSet();
  for (const a of links) {
    const slug = a.dataset.slug;
    if (slug && !pages.has(slug)) {
      a.classList.add("is-red");
      a.title = "Page does not exist yet — click to create";
    }
  }
}
