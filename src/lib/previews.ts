import { fetchMarkdown, PageNotFoundError } from "./content";
import { splitTitle } from "./markdown";
import { BASE, prettify } from "./paths";

type Card = { kind: "page"; title: string; snippet: string } | { kind: "missing" };

const cache = new Map<string, Promise<Card>>();

// Existence + excerpt come from the page's own Markdown on the CDN, so the
// preview is correct even where the manifest/Worker isn't reachable; a 404 is
// the authoritative "red link" signal.
function load(slug: string): Promise<Card> {
  let p = cache.get(slug);
  if (!p) {
    p = fetchMarkdown(slug)
      .then((raw): Card => {
        const { title, body } = splitTitle(raw);
        return { kind: "page", title: title || prettify(slug), snippet: excerpt(body) };
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

function excerpt(body: string): string {
  const para = body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .find((s) => s && !/^[#|>!]/.test(s));
  if (!para) return "";
  const text = para
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l ?? t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

// Hover card over an internal `[[wikilink]]` showing the target's title +
// excerpt, or a "create it" prompt for a red link. Interwiki links (no
// data-slug) are skipped.
export function attachPagePreviews(root: HTMLElement): void {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-slug]");
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

  const show = (a: HTMLAnchorElement, slug: string, data: Card) => {
    if (active !== slug) return;
    remove();
    active = slug;
    card = document.createElement("div");
    card.className = "preview-card";
    card.innerHTML =
      data.kind === "missing"
        ? `<div class="preview-redbox"><span class="pv-redrow">Page not created yet</span>` +
          `<p>There's no page named “${esc(prettify(slug))}” yet.</p>` +
          `<a href="${BASE}/edit/${esc(slug)}">Create this page →</a></div>`
        : `<div class="preview-body"><div class="pv-title">${esc(data.title)}</div>` +
          `<div class="pv-snip">${esc(data.snippet)}</div>` +
          `<div class="pv-foot">Read full page →</div></div>`;
    card.addEventListener("mouseenter", cancelHide);
    card.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(card);
    place(a);
  };

  for (const a of links) {
    const slug = a.dataset.slug;
    if (!slug) continue;
    a.addEventListener("mouseenter", () => {
      cancelHide();
      clearTimeout(showTimer);
      active = slug;
      showTimer = window.setTimeout(() => {
        load(slug)
          .then((data) => show(a, slug, data))
          .catch(() => {});
      }, 280);
    });
    a.addEventListener("mouseleave", () => {
      clearTimeout(showTimer);
      if (active === slug && !card) active = undefined;
      scheduleHide();
    });
  }
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
