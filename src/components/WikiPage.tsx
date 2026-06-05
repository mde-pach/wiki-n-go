import { createSignal, onMount, Show } from "solid-js";
import { fetchMarkdown, PageNotFoundError, renderMarkdown } from "../lib/content";
import type { PageMeta } from "../lib/frontmatter";
import { pageSet } from "../lib/manifest";
import { splitTitle } from "../lib/markdown";
import { BASE } from "../lib/paths";
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
  let body: HTMLDivElement | undefined;

  async function decorate() {
    if (!body) return;
    addSectionEditLinks(body, slug());
    attachCiteTooltips(body);
    await markRedLinks(body);
    document.dispatchEvent(new CustomEvent("wiki:rendered"));
  }

  onMount(async () => {
    if (html()) decorate(); // server-rendered content: build the TOC + red links now
    try {
      const raw = await fetchMarkdown(slug());
      if (raw === props.initialRaw) return; // unchanged since build → keep SSR content (no shift)
      const { title, body, meta: fresh } = splitTitle(raw);
      setMeta(fresh);
      setHtml(renderMarkdown(body));
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
