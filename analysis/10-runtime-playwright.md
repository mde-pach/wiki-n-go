# Runtime / Playwright findings

Live exploration of the running app (`bun run dev`, dev server at
`http://localhost:4321/wiki-n-go/`, frontend talking to the **live production
Worker**). These are behaviours observed in a real browser — they complement the
static code reports (01–08), which by construction could not see hydration-time
defects. Notably, **no static agent found RT-1** (the editor bug); it only shows
up when the page actually hydrates.

Environment note: `bun install` had to be run first — `iso-639-1` was declared in
`package.json` but missing from the installed `node_modules`, so `bun run dev`
crashed on `src/lib/languages.ts` until installed. Worth a clean-clone CI check
(see ENV-1).

## Summary

| ID | Title | Severity |
|---|---|---|
| RT-1 | Full-page editor renders an **empty body** for every existing page (Solid `<textarea value>` SSR/hydration footgun) | **Critical** |
| RT-2 | Sign-in modal: focus not moved into dialog, no focus trap, **Escape does not close** | Medium |
| RT-3 | Home/read page fires a **7-call Worker waterfall** + content fetch on every load | Medium |
| RT-4 | `favicon.ico` 404 on every page (console error, no favicon configured) | Low |
| RT-5 | Flagship `content/index.md` infobox **hotlinks a duckduckgo.com image**; no broken-image fallback | Low |
| ENV-1 | Fresh install was broken (`iso-639-1` not installed); no lockfile/CI guard caught it | Low |

Everything else exercised worked well (see "What works" at the bottom).

---

## RT-1 — Editor shows an empty textarea for existing pages — **Critical**

**The single most important runtime finding.** Opening the full-page editor on
any existing page (`/edit/<slug>`) shows a **blank Markdown textarea and a blank
preview**, even though the page has content.

### Evidence (reproduced deterministically)
- Navigated to `/edit/formatting` (page `content/formatting.md`, 105 lines, "1
  revision"). The textarea showed only the `Write Markdown…` placeholder; preview
  empty. Screenshot: `edit-formatting.png`.
- `document.querySelector('textarea').value.length === 0` after full hydration
  (waited 3 s, re-checked — still 0).
- The content **did** load: `GET …/content/formatting.md` returned `200`, and the
  autosave effect immediately wrote a **2900-char** draft to
  `localStorage['wng-draft:formatting']` — i.e. `body()` actually holds the full
  document. The signal is correct; only the **DOM textarea** is empty.
- Built output confirms the mechanism — `dist/edit/formatting/index.html`
  contains: `class="editor-textarea" rows="20" value="…# Formatting…"`. The body
  is emitted as a **`value` attribute** on the `<textarea>`.
- **HTML `<textarea>` ignores the `value` attribute** — it renders only its child
  text — so first paint is empty, and Solid does **not** re-assign the `.value`
  property during hydration (it assumes the SSR DOM is already correct).
- **Isolation proof:** the *section* editor (`FocusedEditor`, opened by clicking a
  heading `[edit]` on the read page) uses the identical pattern
  (`FocusedEditor.tsx:117` `value={slice()}`) but **works** (textarea populated
  with 658 chars). The difference: it is created **client-side** (Solid sets the
  `.value` property on fresh creation), whereas the full-page editor is
  **SSR-then-hydrated** via Astro `client:load`. So the defect is specific to the
  hydration path, not the JSX.

### Source
- `src/components/Editor.tsx:301-307`
  ```tsx
  <textarea
    ref={ta}
    class="editor-textarea"
    rows={20}
    value={body()}        // ← SSR'd as a value attribute, ignored by the browser
    onInput={(e) => setBody(e.currentTarget.value)}
  />
  ```

### Impact
- The entire product premise is *in-site editing*. Every contributor who clicks
  **Edit** on an existing page is greeted by what looks like a blank page.
- Confusion and data-loss risk: a user may assume the page is empty and retype
  from scratch, or hit Publish over the "blank" (in practice `body()` still holds
  the real text, so a blind publish would *not* blank the page — but the user
  cannot know that, and any local edit is made against an invisible base).
- The live preview also reads empty, compounding the impression.

### Fix (small, high-value)
Force a property assignment instead of an attribute. Cleanest Solid options:
- `prop:value={body()}` (Solid's `prop:` namespace forces property binding, which
  is correct for textarea both at SSR-hydration and client render), **or**
- drive it from the ref:
  ```tsx
  createEffect(() => { if (ta && ta.value !== body()) ta.value = body(); });
  ```
Apply the same fix to `FocusedEditor.tsx:117` and `discussion/Composer.tsx:40`
defensively — they happen to work today only because they are client-created; the
pattern is a latent footgun (and the discussion composer would break if its panel
were ever SSR'd). `Setup.tsx:59` already uses the correct child-text form.

### Test to add
A Playwright e2e smoke test: open `/edit/<existing-slug>`, assert
`textarea.value` contains the page body. This class of bug is invisible to unit
tests and to static review — it needs a real hydration. See report 06.

---

## RT-2 — Sign-in modal accessibility gaps — Medium

The provider chooser (`AuthButton` → `.modal.signin-modal`) is correctly marked
`role="dialog"`, `aria-modal="true"`, `aria-label="Sign in"`. But:
- **Focus is not moved into the dialog on open** — `document.activeElement`
  remains the triggering "Sign in" button (`button.signin`). Screen-reader and
  keyboard users are not placed in the dialog.
- **No focus trap** — Tab will walk out of the dialog into the page behind it.
- **Escape does not close it** — pressed Escape, `[role=dialog]` still present.

WCAG 2.1.1 (Keyboard), 2.4.3 (Focus Order), and the APG dialog pattern. Fix: on
open, move focus to the first interactive element (or the dialog), trap Tab
within it, close on Escape, and restore focus to the trigger on close. The same
review should cover `ConfirmDialog` and the `MainMenu` drawer (see report 08,
which flags these statically).

Screenshot: `dark-signin-modal.png` (also shows dark mode rendering well).

---

## RT-3 — Read-path Worker waterfall — Medium

Loading the home page issued, in addition to the jsDelivr content fetch, **seven**
calls to the Worker:
`/history?slug=index`, `/auth/status`, `/link-graph`, `/patrol-status?slug=index`,
`/whoami`, `/latest`, `/pages` — plus `…/content/index.md` from jsDelivr, plus
~120 static asset requests. The edit page similarly fired `/history`,
`/auth/status`, `/whoami`, `/latest`, content.

Several of these are independent and could be parallelised or collapsed, and some
are redundant per navigation (`/auth/status` + `/whoami` both resolve identity;
`/latest` + content + `/pages` are three round-trips to show one page). On the
static host this is also the source of the historical stale-then-fresh blink. This
corroborates report 05 (performance) — see it for the prioritised payload/round-
trip plan; logged here as the live-observed evidence.

---

## RT-4 — favicon 404 — Low

Every page logs `Failed to load resource: 404 … /favicon.ico`. No favicon is
configured. Cheap polish: add a favicon (and an SVG/PNG app icon) to the static
shell, or a `<link rel="icon">` in `PageShell`/`SiteHeader`.

---

## RT-5 — Fragile external image in flagship content — Low

`content/index.md:15` sets `image: https://duckduckgo.com/i/0cc93634b2107d5b.png`
for the infobox. Hotlinking a DDG thumbnail is fragile (it rendered as a dark/
empty box on first load before resolving). Two issues: (1) the flagship demo
content should not depend on a third-party hotlink; (2) neither the infobox nor
the figure renderer appears to handle a broken image (no `onerror`/placeholder).
Low severity (content, pre-release), but it is the first image a visitor sees.

---

## ENV-1 — Broken fresh install — Low

`bun run dev` failed out of the box with *"iso-639-1 … could not be resolved
(imported by src/lib/languages.ts)"*. `iso-639-1` is in `package.json`
dependencies but was not present in `node_modules` until an explicit
`bun install`. A clean-clone `bun install && bun run build` check in CI would
catch this class of drift. Low, but it blocks first-run.

---

## What works well (verified live)

- **Reading**: home, doc pages, dark mode, and **mobile (390px)** all render
  cleanly with correct Wikipedia-style chrome, landmarks, references region, TOC.
  Dark mode and the appearance panel (text size / width / color / skin) apply
  pre-paint with no blink and persist across navigation.
- **Search**: instant, ranked, highlighted snippets, result count, keyboard hints
  ("↩ to open") — strong UX.
- **History**: revision list, compare-any-two radios, cur/prev quick links,
  permalink, keyboard row-nav hints — all present.
- **Not-found / create flow**: a missing slug shows "No page named "…" yet.
  Create it →" with a real 404 status — graceful.
- **Special pages**: all reports present (WhatLinksHere, PageInfo, AllPages,
  Categories, MostLinked, Wanted, Orphaned, Dead-end, Redirects, Statistics,
  Random, Cite, Create).
- **Admin gate**: anon users get "This console is restricted to maintainers."
  (client-side gate; server-side per-endpoint enforcement is assessed in report 01).
- **Section editing** (`FocusedEditor`): opens in place under the heading and is
  correctly seeded — the one editing surface unaffected by RT-1.

Screenshots referenced above are in [`screenshots/`](screenshots/)
(`home.png`, `edit-formatting.png`, `history.png`, `notfound.png`,
`dark-signin-modal.png`, `mobile-article.png`, `special.png`, `admin-gated.png`).
