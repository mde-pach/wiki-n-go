# Frontend Correctness & Bugs — Wikigit (deep-analysis)

Dimension: Solid islands + Astro pages + client `src/lib`. Findings are ranked by
severity, then by leverage. Every finding cites `file:line`. This is a pre-release
project, so production-hardening theater is deliberately omitted; these are real
defects or high-leverage correctness issues.

## Summary

| ID | Title | Severity |
|----|-------|----------|
| FE-1 | Module caches never invalidated across View Transitions → stale wikilinks/red-links/history/search after an in-site edit | High |
| FE-2 | `whoamiOnce` keyed on nothing: a stale anon identity survives sign-in done in another tab / cross-island, and is reused forever | High |
| FE-3 | `AuthBoot` pre-paint script does not re-run on View-Transition swaps → signed-in avatar reverts to a blank/`Sign in` flash on SPA nav | High |
| FE-4 | NDJSON publish stream: a result split across two `read()` chunks at the final line (no trailing `\n`) is dropped → false "stream ended" error after a successful publish | High |
| FE-5 | `findSection` matches by slug only → duplicate-heading sections edit/splice the wrong section (data loss on save) | High |
| FE-6 | Section-edit baseline goes stale: `raw()` is captured at first fetch, so a focused edit after a background change splices against an outdated body | Medium |
| FE-7 | Reverting wins over a resumed named draft but leaves `activeDraftId` set → publishing silently deletes an unrelated saved draft | Medium |
| FE-8 | `PatrolMeta` runs `client:idle`; on a fast SPA nav its `noindex` meta can leak onto the next page (cleanup races the fetch) | Medium |
| FE-9 | `loadDraft` precedence is "diverges from current" but compares against the wrong baseline for `?template=` / new pages → spurious "restored draft" or lost template | Medium |
| FE-10 | Search keyboard `Enter` uses `window.location.href` (full reload) instead of the SPA router, and `active` index can point past a shrunk list | Low |
| FE-11 | `cardHtml` injects `readHref(slug)`/`data.url` without escaping the attribute the same way as the text → latent attribute-break / minor XSS surface in previews | Low |
| FE-12 | `WikiPage` article `click` listener added in a ref with no `onCleanup`; repeated section-edit opens can stack hidden-node state | Low |

---

## FE-1 — Module caches never invalidated across View Transitions (stale content after an edit)

Severity: High

Evidence:
- `src/lib/manifest.ts:5` — `let cache: Promise<Set<string>> | undefined;` and `pageSet()` returns it forever ("Fetched once per session").
- `src/lib/history.ts:13` — `const cache = new Map<string, Promise<Revision[]>>();` memoised per slug, only dropped on rejection.
- `src/lib/previews.ts:10` — `const cache = new Map<string, Promise<Card>>();`.
- `src/lib/decorate.ts:86` — `const transcludeCache = new Map<string, Promise<string>>();`.
- The only swap hooks in the codebase are `ThemeBoot.astro:65` and `previews.ts:236` (grep for `astro:before-swap` returns just these two). Nothing resets the caches above.
- `PageShell.astro:110` mounts `<ClientRouter />`, so in-site navigation is a View Transition (no full reload) — the JS module graph (and these caches) survives.

Why it matters: After a user publishes an edit (especially creating a new page, or
changing a page's title/description), they navigate the site via the SPA router.
`pageSet()` still returns the pre-edit slug set, so:
- A freshly created page still renders as a **red link** on every other page (`markRedLinks` in `decorate.ts:235` consults the stale `pageSet`).
- The full-text search list (`Search.load()` → `getSearchDocs`) and hover previews (`previews.load`) show stale titles/snippets.
- `getHistory` returns the pre-edit revision list, so `PageMeta` shows the wrong "N revisions"/last author for the page just edited until a hard reload.

The module comments claim "once per session" as intentional, but a "session" here
spans many edits because the SPA never tears the module down. WikiPage's own
content refetch (`fetchMarkdown`, `cache:"no-store"`) is fresh, masking the bug for
the *current* page while every cross-page derived view stays stale.

Fix: Invalidate the session caches on navigation. Add an `astro:after-swap`
listener (a single shared module) that clears `manifest` (`cache = undefined`),
`history`'s map, `previews`' maps, and `transcludeCache`. Cheaper alternative:
key these caches on the latest SHA from `resolveLatestSha()` and refetch when the
SHA changes. At minimum, bust `pageSet` after a successful `submitEdit`.

---

## FE-2 — `whoamiOnce` is reused forever and can't see a sign-in that happened elsewhere

Severity: High

Evidence:
- `src/lib/solid.ts:67` — `let whoamiOnce: Promise<WhoAmI> | undefined;`
- `src/lib/solid.ts:83` — `whoamiOnce ??= getWhoami().then(...)` — once resolved it is never refetched.
- The comment at `solid.ts:64` says "A full reload (sign-in/out) drops the module and re-fetches", and `auth.ts:98`/`auth.ts:97` (`logout` → `location.reload()`) and `login` (`location.href = …` → full nav) do force a reload. **But** `TokenCapture.astro:11` captures a token from the URL fragment *without reloading* (`history.replaceState`), and the OAuth callback returns to `returnUrl` which on the same SPA could be reached without dropping the module in some flows.

Why it matters: `getWhoami` is sent with `authHeaders()` read **at fetch time**
(`api.ts:66` → `getJson({auth:true})` → `authHeaders()` reads `localStorage` then).
But `whoamiOnce` is created on the *first* island that calls `useWhoami()`. If the
Editor/Curation island fetches whoami **before** `TokenCapture` has stored the
token (both are inline/early, ordering is not guaranteed across `client:load`
islands), the cached promise resolves to the anon identity and is reused by every
later island for the rest of the page life — the user appears anonymous in the
editor attribution row and the maintainer curation bar even though they are signed
in. The cached `wiki_tier` (`solid.ts:72`) compounds this by painting a stale tier.

Fix: Make whoami invalidation explicit. Either (a) clear `whoamiOnce` in
`TokenCapture` after storing a token and dispatch an event islands listen to, or
(b) key `whoamiOnce` on the current token (`localStorage.getItem("wiki_session")`)
so a token change forces a refetch, or (c) have `useWhoami` recompute when the
session signal changes. Also clear `whoamiOnce` (not just `wiki_tier`) on logout.

---

## FE-3 — `AuthBoot` pre-paint does not survive View-Transition swaps; signed-in chrome flashes back to "Sign in"

Severity: High

Evidence:
- `AuthBoot.astro:10` — the pre-paint script is `is:inline` and runs once to paint `#auth-pre`.
- `AuthButton.tsx:49-52` — on mount it does `document.getElementById("auth-pre")?.remove()` and takes over; it is `client:only="solid-js"` (`PageShell.astro:134`).
- `PageShell.astro:124` — the `<header>` (containing both `AuthBoot` and `AuthButton`) has `transition:persist`.

Why it matters: Two interacting problems on SPA navigation:
1. With `transition:persist` on the header, Astro keeps the **existing** persisted
   header DOM and discards the incoming document's header. The persisted
   `AuthButton` island keeps running, which is the intent — *but* the inline
   `AuthBoot` script in the incoming document does not execute (inline module/
   non-module scripts in a persisted subtree are not re-run), so the
   `#auth-pre` placeholder mechanism is only ever correct on the **first** full
   load. The commit history (W8) was specifically about killing the signed-in
   flash; the pre-paint guarantee silently does not hold for in-site navigations.
2. If the header were *not* persisted, the opposite bug appears: the new
   document ships a fresh `#auth-pre` (painted by `AuthBoot` at SSR time as the
   signed-out button, because the server can't read localStorage), and the inline
   script that would fix it does not run on swap → a guaranteed signed-in→"Sign in"
   flash until `AuthButton` rehydrates.

Either way the W8/R4 "zero-flash signed-in chrome" invariant is only true on hard
loads, not on the SPA navigations the app is built around.

Fix: Move the AuthBoot pre-paint logic into a persistent `astro:before-swap`
handler (like `ThemeBoot.astro:65` already does for appearance) so the avatar/
button is re-painted into the incoming `#auth-pre` before each swap, OR rely
solely on the persisted `client:only` AuthButton and drop `#auth-pre` entirely for
the SPA case. Verify with an actual cross-page click while signed in.

---

## FE-4 — NDJSON publish: a terminal `done` event in the last chunk without a trailing newline is dropped

Severity: High

Evidence:
- `src/lib/api.ts:96-119` — the read loop only parses lines on `buffer.indexOf("\n")`; after `done` it breaks and then throws `"The publish stream ended before completing."` (`api.ts:119`). The final `buffer` (any bytes after the last `\n`) is never parsed.

Why it matters: NDJSON is "newline-**delimited**", and many producers do not emit
a trailing newline after the final record. If the Worker writes
`{"type":"done","result":…}` as the last line **without** a trailing `\n`, or if
the network delivers that JSON object in the very last chunk with the `\n` absent,
the loop sees `done` from `reader.read()` with a non-empty `buffer` it never
processes — so a **successfully published edit** surfaces to the user as the error
"The publish stream ended before completing. Please try again." Re-submitting then
hits the idempotent/reconcile path, but the user has been told it failed and the
draft was NOT cleared (`Editor.confirmSubmit` only clears the draft on a returned
result — `Editor.tsx:264-269`). This is exactly the kind of false-negative that
makes users double-publish.

Fix: After the loop breaks on `done`, flush the remaining buffer:
```ts
const tail = buffer.trim();
if (tail) {
  const event = JSON.parse(tail);
  if (event.type === "done") return event.result;
  if (event.type === "error") throw new ApiError(event.status ?? 500, event.error);
}
```
Also `decoder.decode()` (no args) once at the end to flush any multi-byte tail.

---

## FE-5 — `findSection` matches headings by slug only → duplicate headings edit the wrong section

Severity: High

Evidence:
- `src/lib/editor-section.ts:36-62` — `findSection` returns the **first** heading whose `slugifyLabel(text) === section`.
- `src/lib/paths.ts:74` — `slugifyLabel` lowercases and strips punctuation, so "Notes" and "notes", or two "Examples" sections, collapse to the same slug.
- The section `[edit]` link is built from the DOM heading `id` (`decorate.ts:125` `?section=${h.id}`), and markdown-it-anchor disambiguates duplicate ids (e.g. `examples`, `examples-1`). `WikiPage.onArticleClick` (`WikiPage.tsx:145`) reads that id and calls `findSection(md, id)` — but `findSection` re-derives slugs from the raw markdown with **no disambiguation suffix**, so `examples-1` never matches and `examples` always matches the *first* occurrence.

Why it matters: On any page with two headings that slugify identically, clicking
`[edit]` on the **second** one opens the editor seeded with the **first**
section's text, and on save `spliceSection` (`editor-section.ts:68`) overwrites the
first section's character span with the user's edit of what they believed was the
second — silent content corruption / data loss, routed through the normal publish
pipeline (so it can auto-merge live).

Fix: Make `findSection` disambiguation-aware: track a per-slug occurrence counter
matching markdown-it-anchor's `slug-N` scheme, or pass the heading **index** /
character offset from the DOM (the anchor id) rather than re-slugifying. Unit-test
with a doc containing two identically-titled `##` sections.

---

## FE-6 — Focused section editor splices against a possibly-stale `raw()` baseline

Severity: Medium

Evidence:
- `WikiPage.tsx:64` — `const [raw, setRaw] = createSignal(props.initialRaw);`
- `WikiPage.tsx:123-126` — onMount sets `raw` to the fetched latest, but if `latest === props.initialRaw` it `return`s early; `raw` is whatever was last set.
- `WikiPage.tsx:146-148` — `onArticleClick` reads `const doc = raw();` and builds the splice baseline from it.
- `FocusedEditor.tsx:48-49` — `content()` = `reconstruct(spliceSection(props.source, props.span, slice()))`, where `props.source`/`props.span` were captured at open time from that `raw()`.

Why it matters: `raw()` is only refreshed by `WikiPage`'s own onMount fetch and by
`showPublished`/`showRevision`. It is **not** refreshed if the page content changes
on the server while the reader sits on the page (no polling). The span offsets in
`SectionSpan` are absolute character indices into that captured body; if the live
page diverged, `spliceSection` writes the edit at the wrong byte range. The Worker's
3-way merge catches *overlapping* divergence, but a non-overlapping shift in an
earlier section moves every later offset, so the splice can land mid-paragraph and
still merge "cleanly". The whole-page Editor avoids this by always submitting the
full reconstructed document against `original()`, but it has the same `original`
staleness window.

Fix: Re-fetch the page body at the moment a focused edit opens (or recompute the
span against freshly fetched markdown), and/or have the Worker validate that the
submitted document's unaffected regions still match the base blob it merges onto.

---

## FE-7 — Revert overrides a resumed named draft but keeps `activeDraftId`, so publishing deletes an unrelated draft

Severity: Medium

Evidence:
- `Editor.tsx:100-103` onMount order: `restoreDraft()` → `applyNamedDraft()` → `await applyRevert()`.
- `applyNamedDraft` (`Editor.tsx:152-163`) sets `setActiveDraftId(draft.id)` when `?draft=<id>` is present.
- `applyRevert` (`Editor.tsx:111-122`) overrides the document with the reverted revision but does **not** clear `activeDraftId`.
- `confirmSubmit` (`Editor.tsx:266-269`) on success does `const id = activeDraftId(); if (id) deleteNamedDraft(id);`.

Why it matters: A URL carrying both `?draft=<id>` and `?revert=<sha>` (or a draft
auto-applied then a revert link followed) ends with the editor showing the revert
content but `activeDraftId` still pointing at the resumed named draft. Publishing
the **revert** then deletes the user's saved named draft, which has nothing to do
with what was published. The SPEC precedence (revert > named-draft > scratch) is
honored for *content* but not for the draft-deletion side effect.

Fix: In `applyRevert` (and `restoreDraft`), reset `activeDraftId`/`draftName` when a
higher-precedence source takes over, or only delete the named draft when the
published content actually originated from that draft.

---

## FE-8 — `PatrolMeta` `noindex` tag can leak across an SPA navigation

Severity: Medium

Evidence:
- `PageShell.astro:158` — `<PatrolMeta slug={slug} client:idle />` (only on read view, non-SSR).
- `PatrolMeta.tsx:13-27` — onMount fetches `/patrol-status`; on `!patrolled` it appends a `<meta name="robots" content="noindex">` to `document.head`; `onCleanup(() => el?.remove())`.

Why it matters: Two issues. (1) `client:idle` means the fetch may still be in
flight when the reader navigates away via the SPA router. `onCleanup` removes
`el`, but `el` is only assigned **after** the await resolves (`PatrolMeta.tsx:19`);
if the component is disposed mid-fetch, `el` is still `undefined` at cleanup, and
then the resolved promise appends the meta to the *new* page's head with no
component left to clean it up — a stray `noindex` on a possibly-patrolled page.
(2) The meta is appended to `document.head`, which is replaced on a full
View-Transition swap but the timing of the late append vs the swap is racy. Because
this controls indexability, a leak is more than cosmetic.

Fix: Guard the append with a disposed flag (set in `onCleanup`) and bail if
disposed before the fetch resolves; or use an `AbortController` tied to cleanup.
Prefer the SSR/edge `noindex` path where available (already implemented at
`[...slug].astro:81`).

---

## FE-9 — `loadDraft` "diverges from current" baseline is wrong for templates/new pages

Severity: Medium

Evidence:
- `draft.ts:14-25` — `loadDraft(slug, current)` returns the stored draft only if `d.content !== current`.
- `Editor.tsx:89-104` onMount: for an existing page it sets `original` and `applyDocument(raw)`; for a missing page it `seedTemplate()`. **Then** `restoreDraft()` runs (`Editor.tsx:100`), calling `loadDraft(slug(), content())`.
- `content()` (`Editor.tsx:65`) reflects the just-seeded template for a new page.

Why it matters: The "don't surface a restored banner if nothing changed" guard
compares the saved draft against `content()` at the moment `restoreDraft` runs. For
a `?template=` new-page flow, `content()` is the freshly built template, so a saved
draft equal to the template is suppressed (fine) — but a draft saved *before* the
template existed, or the autosave written on a prior visit, is compared against the
template rather than the blank baseline the user expects, producing inconsistent
"Restored your unsaved draft" banners and occasionally clobbering a seeded template
with an older autosave (since `restoreDraft` calls `applyDocument(draft.content)`
unconditionally when it diverges). The interaction of `persistDraft` (gated on
`ready()`, `Editor.tsx:182-187`) and these onMount mutations is subtle and not unit
covered for the template path.

Fix: Define the draft baseline explicitly (the server `original`, not the seeded
template) and make precedence template-vs-draft a single decision rather than two
sequential `applyDocument` calls. Add tests for new-page + saved-autosave.

---

## FE-10 — Search `Enter` does a full reload and `active` can index a stale list

Severity: Low

Evidence:
- `Search.tsx:55-56` — `if (it) window.location.href = it.href;` (full navigation, bypasses `ClientRouter`).
- `Search.tsx:42-44`/`91` — `move()` clamps modulo `items().length`, but `onInput` resets `setActive(0)`; if results shrink between keystroke and Enter, `items()[active()]` can be undefined (handled by the `if (it)` guard, so no crash) but the highlighted row and the row that opens can disagree.

Why it matters: Inconsistent with the rest of the app, which navigates via the SPA
router (`<a href>`); using `window.location.href` forces a full document load,
losing the View-Transition feel and re-running all islands. Minor UX/perf, not a
crash.

Fix: Navigate by setting `location.href` only as a fallback; prefer clicking the
anchor or using the router's navigate. Clamp `active` against the current
`items().length` at read time.

---

## FE-11 — Preview card builds hrefs with text-escaper, not attribute-safe escaping

Severity: Low

Evidence:
- `previews.ts:182` — `<a href="${BASE}/edit/${esc(slug)}">` and `previews.ts:196` — `href="${esc(readHref(slug))}"`, `previews.ts:189` — `href="${esc(data.url)}"`.
- `esc` (`previews.ts:240-245`) escapes `& < > "` — adequate for a double-quoted attribute, but slugs/URLs are concatenated into HTML built by hand and rendered via `innerHTML` (`previews.ts:208`).

Why it matters: `esc` does cover `"` so attribute breakout is prevented for the
quoted href, and slugs are constrained by `slugifyPath`. The risk is low and mostly
latent, but the pattern (hand-built HTML strings → `innerHTML`) is fragile: any
future field rendered unquoted, or a `data.url` from the Wikipedia API that contains
a quote, relies entirely on `esc` being applied at every interpolation. The
Wikipedia `content_urls` value is third-party.

Fix: Build the card with DOM APIs (`createElement`, `.href`, `.textContent`) instead
of `innerHTML` string concatenation, or route through DOMPurify like the article
render path.

---

## FE-12 — `WikiPage` attaches the article `click` listener in a ref callback with no cleanup; section-edit hidden state can stack

Severity: Low

Evidence:
- `WikiPage.tsx:241-246` — `ref={(el) => { body = el; el.addEventListener("click", onArticleClick); }}` — no `onCleanup` removal.
- `closeSectionEdit` (`WikiPage.tsx:167-178`) restores hidden nodes; `onArticleClick` calls `closeSectionEdit()` before opening a new one (`WikiPage.tsx:153`), which mitigates stacking — but `hideSection` (`WikiPage.tsx:273-285`) walks siblings of a freshly inserted `mountEl`, and if `showPublished`/`render` replaces `body`'s `innerHTML` while a section editor's hidden nodes are still referenced, the captured `hidden` array points at detached nodes.

Why it matters: Mostly benign because Solid disposes the island and the element is
GC'd, and `closeSectionEdit` is called before re-open. The concrete edge case: a
publish from the focused editor sets `publishedDoc` and `closeSectionEdit` →
`showPublished` re-renders `body.innerHTML` (`render` → `setHtml`), but the
`hidden` nodes were already restored on the old DOM that is about to be replaced —
no leak, but the listener is re-added on each WikiPage instance with no symmetric
removal, which is a code-smell that will bite if WikiPage is ever kept alive across
swaps (cf. FE-3's `transition:persist`).

Fix: Register the listener in `onMount` with `onCleanup(() => body?.removeEventListener("click", onArticleClick))`, and prefer event delegation that re-reads the live DOM.

---

## Notes / non-issues verified

- `PageMeta.tsx:17-20` correctly avoids the locale/timezone hydration flip by
  slicing the ISO date string (matches the memory note "no locale formatting in
  islands"). Good.
- `ThemeBoot.astro:65` correctly re-applies appearance on `astro:before-swap` —
  this is the pattern FE-3 should follow for auth.
- `pow.ts:34-46` yields to the event loop between chunks; no UI-freeze bug.
- `thread-store.ts:43-50` uses `reconcile({key:"id"})` to keep row identity — sound.

---

## Verification

Independent re-read of every Critical/High finding (FE-1 … FE-5). Each verdict
re-derives from the cited source, defaulting to skepticism.

### FE-1 — CONFIRMED (High)
Re-read `manifest.ts:5-10` (`pageSet()` memoises `cache` forever, never reset),
`history.ts:13` (per-slug map dropped only on rejection), `previews.ts` caches,
`decorate.ts:238` (`markRedLinks` consults `pageSet()`). `grep astro:(before|after)-swap`
returns only `ThemeBoot.astro:65` and `previews.ts:236` — neither clears any of these
caches. `PageShell.astro:110` mounts `<ClientRouter />`, so SPA nav keeps the module
graph alive. Claim holds: a created page stays a red link / stale search until a hard
reload. High is fair for a content-correctness defect.

### FE-2 — DOWNGRADED (to Low)
The mechanism is real (`solid.ts:67,83` memoises `whoamiOnce` forever; cleared only by
full reload), but the in-page race the report leans on is largely prevented. `TokenCapture.astro:5`
is `is:inline` in `<head>` (`PageShell.astro:119`); inline head scripts execute during
parse, before any `client:load` island bundle hydrates, so the token is in `localStorage`
before the first `getWhoami()`. Both auth transitions force a fresh module: `login` →
`location.href` (`auth.ts:92`), `logout` → `location.reload()` (`auth.ts:98`), and the OAuth
return is itself a full navigation. The residual (a sign-in in *another* tab not invalidating
this tab's `whoamiOnce`) is a genuine but low-impact edge, not a High in-page identity bug.
Note: the inline comment `solid.ts:64` ("the Worker reads it from the cookie") is itself wrong
— `auth.ts:3-7,81-85` shows bearer-token-from-localStorage, not a cookie — but that does not
rescue the High rating.

### FE-3 — REFUTED
Re-read `AuthBoot.astro` (inline pre-paint of `#auth-pre`), `AuthButton.tsx:46-52`
(`client:only`, removes `#auth-pre` on mount), and crucially `PageShell.astro:124`
(`<header … transition:persist>`). With the header persisted, the live `client:only`
`AuthButton` island is *not* torn down across an SPA swap — it keeps rendering the
signed-in avatar from its own `getSession()` signal, so there is no window for a
"Sign in" flash. The pre-paint placeholder is only needed before the island bundle
loads, i.e. on a cold full load, which is exactly when `AuthBoot` *does* run. The
report's point 2 is explicitly conditioned on "if the header were not persisted" — but
it is persisted, so that branch never fires. No flash bug substantiated.

### FE-4 — REFUTED (downgrade to Low at most)
The throw at `api.ts:119` is reachable only if the stream closes with no terminal frame.
The sole producer, `http.ts:74-97`, emits **every** event via `send = … encode(\`${JSON.stringify(event)}\n\`)`
(`http.ts:83`), including the `{type:"done"}` frame (`http.ts:88`) — always with a trailing
`\n`. Stream chunk boundaries from `reader.read()` are arbitrary but never drop bytes, so the
final `\n` always lands in `buffer`; the `for` loop at `api.ts:100` finds it and `return`s
`event.result` (`api.ts:114`) before the post-loop throw. The "successful publish surfaces as
an error" scenario cannot occur against this Worker. A defensive tail-flush is mild hygiene,
not a High false-negative defect.

### FE-5 — CONFIRMED (High)
Re-read `markdown.ts:15-17` (markdown-it-anchor configured with `slugify: slugifyLabel`,
which by default applies the plugin's `uniqueSlug` → duplicate headings get `…-1`, `…-2`
ids), `decorate.ts:125` / `markdown.ts:165` (the `[edit]` link carries `?section=${h.id}`,
i.e. the *disambiguated* id), `WikiPage.tsx:145-149` (reads that `section` param and calls
`findSection(md, id)`), and `editor-section.ts:48` (`findSection` matches `slugifyLabel(m[2]) === section`,
re-slugifying raw headings with **no** `-N` suffix — `paths.ts:74-80` confirms no
disambiguation). So `examples-1` never matches and `examples` always resolves to the first
occurrence; editing the second duplicate heading splices the first (`spliceSection`,
`editor-section.ts:68`). Silent content corruption confirmed. High is fair.

### Verifier summary
5 High findings checked: **2 CONFIRMED** (FE-1, FE-5), **1 DOWNGRADED** (FE-2 → Low),
**2 REFUTED** (FE-3, FE-4). The two confirmed are the load-bearing ones (stale-cache UX
and duplicate-heading data loss). FE-3 and FE-4 both fail because the report did not account
for `transition:persist` keeping the auth island alive (FE-3) and the Worker always writing a
trailing newline (FE-4).
</content>
</invoke>
