# Performance, Bundle Weight & Load Time — Audit

Dimension: read-path performance and payload for Wikigit (Astro static shell + Solid islands; one Cloudflare Worker backend).

Method: built the site (`bun run build`, 66 pages) and inspected `dist/_astro/*` chunk sizes (raw + gzip), traced static-vs-dynamic imports inside the emitted chunks, and read the read-path source (`src/pages/[...slug].astro`, `WikiPage.tsx`, `PageCuration.tsx`, `PatrolMeta.tsx`, `lib/content.ts`, `lib/decorate.ts`, `lib/manifest.ts`, `lib/solid.ts`, `lib/api.ts`) plus the Worker response helpers (`worker/src/http.ts`, `worker/src/handlers/index-cache.ts`).

Measured read-path JS for the home page: **~358 KB raw / ~139 KB gzipped** across the eagerly-loaded chunks.

## Summary

| ID | Title | Severity |
|----|-------|----------|
| PERF-1 | WikiPage statically imports the whole editor stack onto the read path | High |
| PERF-2 | `yaml` (frontmatter parser, 30 KB gz) ships on the read path for runtime re-parse | High |
| PERF-3 | Read path always refetches SSR'd content: `/latest` → jsDelivr waterfall on every load | High |
| PERF-4 | Worker JSON read endpoints set no `Cache-Control` / `s-maxage` — zero edge caching | High |
| PERF-5 | 4+ Worker round-trips per read (`/latest`, `/pages`, `/whoami`, `/auth/status`, history) mostly unbatched | Medium |
| PERF-6 | No font preload → guaranteed FOUT on first paint for the body serif | Medium |
| PERF-7 | markdown-it + DOMPurify (62 KB gz) loaded eagerly even though content is SSR'd as HTML | Medium |
| PERF-8 | 11 `client:load` islands on the read path; several could be `client:visible`/`idle` | Medium |
| PERF-9 | `/whoami` fires for every anonymous reader even though it only gates maintainer UI | Low |
| PERF-10 | Single 84 KB CSS bundle inlines all 23 font-face blocks + every view's styles | Low |

---

## PERF-1 — WikiPage drags the entire editor stack onto the read path

**Severity: High**

Evidence — `src/components/WikiPage.tsx:18`:
```ts
import FocusedEditor from "./editor/FocusedEditor";
```
This is a *static* top-level import (used at `WikiPage.tsx:251` for in-place section editing). `WikiPage` is `client:load` on the read route (`src/pages/[...slug].astro:111`). Confirmed in the build: the emitted `WikiPage` chunk statically pulls the editor toolchain — `grep` of `dist/_astro/WikiPage.DvpbK44d.js` shows `from"./DiffView.aIJQT3m7.js"`, `from"./ConfirmDialog.g1dbqNOH.js"`, `from"./MarkdownToolbar.D0qqvv-3.js"`, `from"./editor-section.DhLTnNXJ.js"`, `from"./api.DPJY2K20.js"` — none behind `import()`.

Chunk weights pulled onto the read path purely for the section editor:

| chunk | raw | gzip |
|---|---|---|
| MarkdownToolbar | 11.1 KB | 4.6 KB |
| DiffView | 9.1 KB | 3.4 KB |
| editor-section | 1.6 KB | 0.9 KB |
| ConfirmDialog | 0.9 KB | 0.5 KB |
| api | 1.5 KB | 0.8 KB |

**Why it matters:** A reader who never clicks `[edit]` downloads, parses, and modulepreloads the diff renderer and markdown toolbar on *every* page view. ~10 KB gzipped of pure editor code on the critical path, plus the parse/compile cost. `FocusedEditor` is only reachable after a click, so it is a textbook lazy-import candidate.

**Fix:** Lazy-load the editor. Replace the static import with `const FocusedEditor = lazy(() => import("./editor/FocusedEditor"))` (Solid's `lazy`) and render it inside `<Suspense>` only when `sectionEdit()` is set. `findSection`/`splitFrontmatter` (cheap) can stay; the heavy `FocusedEditor` → `MarkdownToolbar`/`DiffView` graph then splits into a click-loaded chunk. Estimated read-path saving: **~9–10 KB gz + parse time**, and it removes the editor chunks from the modulepreload set.

---

## PERF-2 — `yaml` (30 KB gz) ships on the read path to re-parse frontmatter the server already parsed

**Severity: High**

Evidence — `src/lib/frontmatter.ts:1`:
```ts
import { parse, stringify } from "yaml";
```
`frontmatter.ts` is statically imported by `WikiPage.tsx:6` (`splitFrontmatter`, `withFrontmatter`) and by `lib/markdown.ts:7`. The built `frontmatter.B6kxWQTt.js` chunk is **97.8 KB raw / 30.5 KB gzipped** — almost entirely the `yaml` package — and `dist/_astro/WikiPage.DvpbK44d.js` statically references `from"./frontmatter.B6kxWQTt.js"`.

**Why it matters:** This is the single largest non-markdown dependency on the read path. The page's frontmatter (`meta`) is already parsed at build/SSR time and passed into `WikiPage` as the `meta` prop (`[...slug].astro:111`, `parsed?.meta`). The client only needs `yaml` again when it (a) refetches the raw markdown in `onMount` (see PERF-3) and (b) opens a section editor. Both are deferrable.

**Fix, in priority order:**
1. The full `yaml` parser is overkill for frontmatter. Wikigit frontmatter is shallow key/value/list/map; a ~30-line hand-rolled parser (or a tiny dep) would drop ~30 KB gz outright. The Worker side can keep `yaml` if it needs round-trip stringify.
2. If keeping `yaml`, move `splitFrontmatter`/`withFrontmatter` into the lazily-imported editor chunk (PERF-1) so `yaml` only loads on edit, not on read. Combined with PERF-3 (skip the on-mount refetch), the read path needs no client-side YAML at all.

Estimated saving: **up to ~30 KB gz** off the read path.

---

## PERF-3 — Read path unconditionally refetches content it was just served (SSR'd), via a `/latest` → jsDelivr waterfall

**Severity: High**

Evidence — `src/components/WikiPage.tsx:115-133` (`onMount`):
```ts
if (props.fresh) return; // edge-SSR only
const latest = await fetchMarkdown(slug());
setRaw(latest);
if (latest === props.initialRaw) return; // unchanged → keep SSR content
```
On the **static (GitHub Pages) path** `props.fresh` is false (`[...slug].astro:111` passes `fresh={ssr}`, and `ssr` is false for prerendered pages). So every read does `fetchMarkdown`, which is (`lib/content.ts:34-35`):
```ts
return fetchMarkdownAt(slug, await resolveLatestSha());
```
`resolveLatestSha()` hits the Worker `GET /latest` with `cache: "no-store"` (`content.ts:12-16`), and only *then* fetches the markdown from jsDelivr (`content.ts:39-43`). These are strictly **sequential** — a network waterfall — and run on every page load even though the identical content is already in the SSR'd HTML and re-rendered into `html()`.

**Why it matters:** This is the design's "no-rebuild freshness" mechanism, but it imposes a guaranteed 2-hop round-trip after hydration on *every* read, on content the user is already looking at. `/latest` is `no-store` so it can't be served from browser cache; if the Worker's 20 s KV cache (`index-cache.ts:16`) is cold it also incurs a GitHub API call. The jsDelivr fetch can't start until `/latest` resolves. For most reads the result is byte-identical (`latest === props.initialRaw`) and discarded — pure waste plus a re-decorate.

**Fix:**
- Parallelize: kick off the jsDelivr fetch against the *build-time* SHA immediately while `/latest` resolves; only refetch if the SHA differs. Or embed the build SHA and fetch `cdn.jsdelivr.net/...@<buildSha>` from cache instantly, then revalidate `/latest` in the background.
- Better: gate the refetch on staleness, not always-on. The static HTML is already correct at deploy time; a `requestIdleCallback`-deferred revalidation (instead of blocking `onMount`) removes it from the critical path entirely.
- The "stale-then-fresh blink" history this code fights is real, but the fix shouldn't be a synchronous waterfall on the happy path. Defer + diff-before-swap (already present via `latest === props.initialRaw`) means the common case can skip the network hop with a short-TTL conditional request.

---

## PERF-4 — Worker JSON read endpoints emit no cache headers; nothing is edge-cacheable

**Severity: High**

Evidence — `worker/src/http.ts:53-62` (the `json()` helper used by all read endpoints):
```ts
export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
```
No `Cache-Control` is set. `/latest`, `/pages`, `/link-graph`, `/whoami`, `/patrol-status` all route through this (`worker/src/index.ts:77-94`). The only `Cache-Control` anywhere in the Worker is `no-store` on the NDJSON edit stream (`http.ts:104`). Meanwhile the *client* forces `cache: "no-store"` on `/latest` and `/pages` (`content.ts:15`, `manifest.ts:15`, `api.ts:45`).

**Why it matters:** Every read-path JSON call reaches the Worker origin — Cloudflare's edge cache can't help because (a) no `s-maxage` is set and (b) the client sends `no-store`. `/pages` and `/link-graph` are effectively immutable between commits and are perfect `s-maxage` candidates. `/latest` only needs ~20–30 s freshness (it already has a 20 s KV cache server-side) and could carry `s-maxage=15, stale-while-revalidate` so repeat readers hit the edge, not the Worker. The edge-SSR content route already does exactly this (`[...slug].astro:82-85`, `s-maxage=30, stale-while-revalidate=600`); the JSON endpoints don't.

**Fix:** Add `Cache-Control` to `json()` per-endpoint: `/pages` and `/link-graph` → `public, s-maxage=60, stale-while-revalidate=600`; `/latest` → `public, s-maxage=15, stale-while-revalidate=60`; `/whoami` and `/patrol-status` stay `private, no-store` (identity/per-page state). Drop the client `cache: "no-store"` on `/latest`/`/pages` so the browser + edge can serve them. This converts repeat-visit read-path JSON from N origin hits to edge hits.

---

## PERF-5 — 4+ Worker round-trips per read, largely un-batched

**Severity: Medium**

Evidence — for an anonymous reader on the static path, the following fire on/after hydration:
- `GET /latest` then jsDelivr markdown — `WikiPage.onMount` (`WikiPage.tsx:123` → `content.ts:34`). Sequential (PERF-3).
- `GET /pages` — `decorate` → `markRedLinks` → `pageSet()` (`decorate.ts:17`, `decorate.ts:238`, `manifest.ts:7`).
- `GET /whoami` — `PageCuration` → `useWhoami()` (`PageCuration.tsx:45` → `solid.ts:82`).
- `GET /auth/status` — `AuthButton.onMount` → `authProviders()` (`AuthButton.tsx:51` → `auth.ts:43`).
- history/revisions — `PageMeta` `createResource(getHistory)` (`PageMeta.tsx:7`).
- `GET /patrol-status` — `PatrolMeta` (`PatrolMeta.tsx:13`), `client:idle` so deferred, static path only.

**Why it matters:** That's ~4 distinct Worker round-trips plus jsDelivr plus possibly GitHub, per page view, none coalesced. Several deliver data the SSR pass already had (history is passed as `revisions` to `PageMeta` as `initial`, yet `getHistory` refetches; `/pages` could be embedded). Each is its own TLS-warm but separate request; on a cold edge they serialize behind the Worker.

**Fix:** (1) Have `/latest` optionally return the page list too, or embed the build-time `/pages` set as a JSON island and revalidate lazily. (2) Pass `getHistory`'s `initial` so `PageMeta` doesn't refetch what SSR already provided. (3) Combine `/whoami` + `/auth/status` into one identity call (both are "who am I / what can I do"). Net: collapse ~4 round-trips toward 1–2.

---

## PERF-6 — No font preload → FOUT on the body serif every cold load

**Severity: Medium**

Evidence: the read page's `<head>` (`dist/index.html`) contains only `<link rel="stylesheet" href=".../_slug_.BRv-mo0Q.css">` and the ClientRouter script — `grep 'rel="preload"' dist/**/*.html` returns nothing. Fonts are declared via `@import` in `src/styles/app.css:1-4` and inlined into the single CSS bundle with `font-display:swap` and per-script `unicode-range` (23 `@font-face` blocks, confirmed in `dist/_astro/_slug_.BRv-mo0Q.css`).

**Why it matters:** Subsetting via `unicode-range` is correct (an English page only pulls the ~50 KB Source Serif latin subset, not all 22 woff2 / 549 KB). But with `font-display:swap` and **no preload**, the browser discovers the body font only after CSS parses, so the first paint renders in the fallback serif and reflows when Source Serif arrives — a visible FOUT/CLS on the primary reading font, on the LCP element (article body).

**Fix:** Add `<link rel="preload" as="font" type="font/woff2" crossorigin href="/.../source-serif-4-latin-wght-normal.*.woff2">` (and the Libre Franklin latin UI weight) to `PageShell.astro`'s head. Preload only the latin-normal subsets that paint above the fold; leave italic/cyrillic/greek to lazy-load. This removes the body-font swap from LCP.

---

## PERF-7 — markdown-it + DOMPurify (62 KB gz) eagerly loaded though content arrives as SSR'd HTML

**Severity: Medium**

Evidence: `dist/_astro/markdown.B4fKlU23.js` is **150 KB raw / 61.9 KB gzipped** (markdown-it + markdown-it-anchor + markdown-it-footnote + DOMPurify + the wikilink/cite/figure plugins, `lib/markdown.ts:1-11`). It's a static dependency of `WikiPage` (`dist/_astro/WikiPage.DvpbK44d.js` → `from"./markdown.B4fKlU23.js"`).

**Why it matters:** On the read path the article HTML is rendered server-side (`[...slug].astro:61` `decorateArticleHtml`) and injected via `innerHTML` (`WikiPage.tsx:245`). The client only needs to *re-render* markdown when it (a) refetches changed content (PERF-3), (b) shows a historic revision, (c) expands a transclusion, or (d) opens the section editor. The 62 KB markdown bundle is on the critical path solely to support those deferred cases.

**Fix:** This is largely resolved by fixing PERF-3 (don't refetch/re-render on the happy path) and PERF-1 (lazy editor). If the on-mount refetch is deferred and `renderResolved`/`renderMarkdown` move behind the lazy paths (revision view, transclusion expand, editor), the markdown bundle leaves the modulepreload set and loads only when actually needed. Transclusion expansion (`decorate.ts:27`) is the one read-path renderer — gate it on the presence of `.transclude` nodes (already does at `decorate.ts:32`) and `import()` `renderMarkdown` there. Potential read-path saving: **~62 KB gz** for pages with no transclusions.

---

## PERF-8 — 11 `client:load` islands on the read path; some are off-screen or idle-eligible

**Severity: Medium**

Evidence — the home read page emits 11 `<astro-island>` elements (`grep -c '<astro-island' dist/index.html` = 11): `Appearance`, `AuthButton`, `LangBar`, `MainMenu`, `PageCuration`, `PageMeta`, `PatrolMeta`, `Search`, `Toc`, `TocMobile`, `WikiPage`. Directives: `[...slug].astro:105,108,110,111,112,115` and `PageShell.astro:126,131,134,150,156` are all `client:load`; only `PatrolMeta` is `client:idle` (`PageShell.astro:158`). Across the codebase: 19 `client:load` vs 1 `client:idle` (`grep -roh 'client:(load|idle|visible)' src`).

**Why it matters:** `client:load` hydrates every island synchronously during the initial load, competing with content paint. Several of these are not above-the-fold or interactive-on-arrival:
- `TocMobile` (`[...slug].astro:108`) — hidden on desktop; could be `client:media` / `client:visible`.
- `Appearance` (`[...slug].astro:115`) — appearance controls in the info column, not LCP-critical; `client:idle`.
- `Search`, `MainMenu`, `LangBar` (`PageShell.astro:131,126,150`) — header controls; interactive only on click; `client:idle` or `client:visible` is sufficient.
- `PageMeta` (`PageShell.astro:156`) — the revision line; SSR'd, only revalidates; `client:idle`.

The per-decision note (2026-06-08) intentionally keeps `PageCuration` `client:load` + shared whoami — that's defensible for maintainers, but it still pays for every anonymous reader (see PERF-9).

**Fix:** Downgrade non-critical islands to `client:idle` (header tools, Appearance, PageMeta) and `client:visible`/`client:media` for `TocMobile`. Keep `WikiPage` and `Toc` eager. This spreads hydration work off the initial frame, improving INP/TBT without changing behavior.

---

## PERF-9 — `/whoami` round-trip fires for every anonymous reader to gate maintainer-only UI

**Severity: Low**

Evidence — `src/components/PageCuration.tsx:43-45`:
```ts
if (!config.workerUrl) return null;
const { isMaintainer } = useWhoami();
```
`useWhoami` (`lib/solid.ts:82-88`) calls `getWhoami()` → `GET /whoami` (`api.ts:65`) on the client for everyone, then `isMaintainer()` gates the actual UI (`PageCuration.tsx:52` `live()` requires `isMaintainer()`). For a logged-out reader the answer is always "not a maintainer," yet the round-trip still happens on every page.

**Why it matters:** A guaranteed Worker round-trip per read whose only consumer is maintainer UI that an anonymous user will never see. It's deduped per session (`solid.ts:67` `whoamiOnce`) and `client:load`, so it's one request per navigation-set, but still origin traffic and a small hydration cost for ~100% of readers who get nothing from it.

**Fix:** Skip `/whoami` when there's no auth signal. The cached tier (`solid.ts:73 cachedTier()`) and session cookie already exist client-side — if there's no session token and no cached `wiki_tier === "maintainer"`, short-circuit `isMaintainer()` to `false` and don't fetch. Only call `/whoami` when a session/cached-tier suggests the user *might* be privileged, or lazily on first interaction with the curation bar.

---

## PERF-10 — One 84 KB CSS bundle inlines all font-faces + every view's styles

**Severity: Low**

Evidence: `dist/_astro/_slug_.BRv-mo0Q.css` is **83.7 KB** (the only CSS file). It is the concatenation of `app.css`'s imports — 4 font CSS files (23 `@font-face` blocks) plus `tokens.css`, `base.css`, `components.css`, `views.css` (`src/styles/app.css:1-8`). `PageShell.astro:2` imports `app.css` for every route.

**Why it matters:** The whole design system (editor styles, admin/special-page styles in `views.css`/`components.css`) ships render-blocking on the read path. It's a single cached file so repeat visits are fine, but first paint blocks on 84 KB of CSS, much of it for views a reader never sees (editor toolbar, diff, admin console). The 23 inlined `@font-face` blocks are cheap (declarations only; `unicode-range` gates the actual woff2 downloads), so the real cost is the non-read view CSS.

**Fix:** Split read-critical CSS (`tokens`, `base`, article/`components` prose rules) from edit/admin/special CSS and load the latter only on those routes (or behind the lazy editor chunk). Astro scopes per-component styles, so moving editor/admin rules into their components would let Vite code-split them out of the read bundle. Lower priority than the JS findings since CSS is one cached request.

---

## Notes on what's already good

- **Mermaid is correctly lazy** (`decorate.ts:105` `await import("mermaid")`), gated on the presence of `pre.mermaid` blocks — the 583 KB mermaid core + 612 KB wardley + diagram chunks never touch a page without diagrams. This is the right pattern; PERF-1/2/7 ask for the same treatment for the editor/yaml/markdown.
- **Font subsetting via `unicode-range`** is in place (23 subsets, `font-display:swap`); only the needed script downloads. PERF-6 is just the missing preload, not a subsetting problem.
- **jsDelivr `@sha` immutability** gives permanent caching with instant freshness — architecturally sound; PERF-3 is about the redundant client refetch, not the CDN strategy.
- **OpenAuth / edge adapters are lazy** (`astro.config.mjs:13-15` dynamic `import()`), kept out of the static build.
- Worker `/latest` (20 s) and `/pages` (60 s) have server-side KV caching (`index-cache.ts:16,28`); PERF-4 is about exposing that as edge `s-maxage`, which the KV layer already makes safe.
