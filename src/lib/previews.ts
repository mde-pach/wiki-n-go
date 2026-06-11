import { fetchMarkdown, PageNotFoundError } from "./content";
import { splitTitle } from "./markdown";
import { BASE, prettify, readHref } from "./paths";

type Card =
  | { kind: "page"; title: string; snippet: string }
  | { kind: "missing" }
  | { kind: "wiki"; title: string; snippet: string; thumb?: string; url: string };

const cache = new Map<string, Promise<Card>>();

interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

// Wikipedia article preview for an interwiki `[[w:Title]]` link, from the public
// REST summary API (CORS-enabled), cached per article (X3).
const wikiCache = new Map<string, Promise<Card>>();
function loadWiki(lang: string, title: string): Promise<Card> {
  const k = `${lang}:${title}`;
  let p = wikiCache.get(k);
  if (!p) {
    p = fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WikiSummary>;
      })
      .then((d): Card => {
        const fallback = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
        return {
          kind: "wiki",
          title: d.title ?? title.replace(/_/g, " "),
          snippet: (d.extract ?? "").trim(),
          thumb: d.thumbnail?.source,
          url: d.content_urls?.desktop?.page ?? fallback,
        };
      });
    wikiCache.set(k, p);
    p.catch(() => wikiCache.delete(k));
  }
  return p;
}

// Existence + excerpt come from the page's own Markdown on the CDN, so the
// preview is correct even where the manifest/Worker isn't reachable; a 404 is
// the authoritative "red link" signal.
function load(slug: string): Promise<Card> {
  let p = cache.get(slug);
  if (!p) {
    p = fetchMarkdown(slug)
      .then((raw): Card => {
        const { title, body, meta } = splitTitle(raw);
        return {
          kind: "page",
          title: title || prettify(slug),
          snippet: meta.description?.trim() || excerpt(body),
        };
      })
      .catch((e): Card => {
        if (e instanceof PageNotFoundError) return { kind: "missing" };
        throw e;
      });
    cache.set(slug, p);
    p.catch(() => cache.delete(slug)); // let a transient failure retry
  }
  return p;
}

// Drop inline markdown that shouldn't surface as plain text: images, wikilinks
// (keep the label), inline links (keep the text), and footnote refs.
export function stripMarkdownInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]:?/g, " ");
}

function excerpt(body: string): string {
  const para = body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .find((s) => s && !/^[#|>!]/.test(s));
  if (!para) return "";
  const text = stripMarkdownInline(para)
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

// One hoverable link: its internal slug (or "" for an interwiki Wikipedia link),
// a stable key for the active-card guard, and the loader for its card.
interface Hoverable {
  a: HTMLAnchorElement;
  key: string;
  slug: string;
  run: () => Promise<Card>;
}

function hoverables(root: HTMLElement): Hoverable[] {
  const out: Hoverable[] = [];
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
    const slug = a.dataset.slug;
    if (slug) {
      out.push({ a, key: `p:${slug}`, slug, run: () => load(slug) });
      continue;
    }
    if (!a.classList.contains("interwiki")) continue;
    try {
      const u = new URL(a.href);
      if (!u.hostname.endsWith(".wikipedia.org")) continue;
      const lang = u.hostname.split(".")[0];
      const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
      if (title)
        out.push({
          a,
          key: `w:${lang}:${title}`,
          slug: "",
          run: () => loadWiki(lang, title),
        });
    } catch {
      /* malformed href — skip */
    }
  }
  return out;
}

// Hover card over an internal `[[wikilink]]` (title + excerpt, or a "create it"
// prompt for a red link) and over an interwiki `[[w:Title]]` (the Wikipedia
// article summary — X3).
export function attachPagePreviews(root: HTMLElement): void {
  const links = hoverables(root);
  if (links.length === 0) return;

  let card: HTMLDivElement | undefined;
  let active: string | undefined;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  const remove = () => {
    card?.remove();
    card = undefined;
    active = undefined;
  };
  const scheduleHide = () => {
    hideTimer = window.setTimeout(remove, 200);
  };
  const cancelHide = () => clearTimeout(hideTimer);
  // Clicking a link (or navigating away) before the card appears must drop the
  // pending show + any in-flight fetch, else it pops in on the next page against
  // the now-detached link's geometry, stranded at the top-left (X1).
  const cancel = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    remove();
  };

  const place = (a: HTMLAnchorElement) => {
    if (!card) return;
    const r = a.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = card;
    const top =
      r.bottom + 8 + h > window.innerHeight - 8
        ? Math.max(8, r.top - h - 8)
        : r.bottom + 8;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  };

  const cardHtml = (slug: string, data: Card): string => {
    if (data.kind === "missing")
      return (
        `<div class="preview-redbox"><span class="pv-redrow">Page not created yet</span>` +
        `<p>There's no page named “${esc(prettify(slug))}” yet.</p>` +
        `<a href="${BASE}/edit/${esc(slug)}">Create this page →</a></div>`
      );
    if (data.kind === "wiki") {
      const thumb = data.thumb
        ? `<img class="pv-thumb" src="${esc(data.thumb)}" alt="" />`
        : "";
      return (
        `<a class="preview-body" href="${esc(data.url)}" target="_blank" rel="noreferrer">${thumb}` +
        `<div class="pv-title">${esc(data.title)}</div>` +
        `<div class="pv-snip">${esc(data.snippet)}</div>` +
        `<div class="pv-foot">Read on Wikipedia →</div></a>`
      );
    }
    return (
      `<a class="preview-body" href="${esc(readHref(slug))}"><div class="pv-title">${esc(data.title)}</div>` +
      `<div class="pv-snip">${esc(data.snippet)}</div>` +
      `<div class="pv-foot">Read full page →</div></a>`
    );
  };

  const show = (a: HTMLAnchorElement, key: string, slug: string, data: Card) => {
    if (active !== key || !a.isConnected) return;
    remove();
    active = key;
    card = document.createElement("div");
    card.className = "preview-card";
    card.innerHTML = cardHtml(slug, data);
    card.addEventListener("mouseenter", cancelHide);
    card.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(card);
    place(a);
  };

  for (const { a, key, slug, run } of links) {
    a.addEventListener("mouseenter", () => {
      cancelHide();
      clearTimeout(showTimer);
      active = key;
      showTimer = window.setTimeout(() => {
        run()
          .then((data) => show(a, key, slug, data))
          .catch(() => {});
      }, 280);
    });
    a.addEventListener("mouseleave", () => {
      clearTimeout(showTimer);
      if (active === key && !card) active = undefined;
      scheduleHide();
    });
    a.addEventListener("click", cancel);
  }

  // SPA swap (view transitions) or a hard navigation — drop any pending card so
  // it can't render against the outgoing page. Re-registered per render.
  document.addEventListener("astro:before-swap", cancel, { once: true });
  window.addEventListener("pagehide", cancel, { once: true });
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
