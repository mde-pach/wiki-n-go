# Accessibility & UX (static) — Wikigit audit

Scope: semantic structure, keyboard/focus, ARIA, color contrast, forms, reduced-motion,
i18n/RTL — evaluated from source (`src/`). A separate agent does live Playwright testing;
this report is static-source-only. Pre-release weighting: real defects and high-leverage
fixes prioritized over production-hardening theater.

## Summary

| ID | Title | Severity |
|----|-------|----------|
| A11Y-1 | Modals & drawer have no focus trap, no focus move-in, no focus restore | High |
| A11Y-2 | `ConfirmDialog` and the sign-in modal can't be dismissed with Escape | High |
| A11Y-3 | `--color-ink-subtle` text fails WCAG AA contrast (default skin + dark) | High |
| A11Y-4 | Async errors are not announced (ErrorNote / NewPage / admin lack live region) | Medium |
| A11Y-5 | Multiple `<main id="main">` / duplicated `id="main"` across SPA-fallback branches | Medium |
| A11Y-6 | No RTL support: `dir` never set despite 183 selectable translation languages | Medium |
| A11Y-7 | Search combobox lacks combobox/aria-controls/activedescendant semantics | Medium |
| A11Y-8 | Figure `alt` text duplicated into `<figcaption>` (double announcement) | Low |
| A11Y-9 | Tools dropdown misuses `role="menu"`/`menuitem` on a `<details>` link list | Low |
| A11Y-10 | Background scroll/content not inert while drawer/modal is open | Low |
| A11Y-11 | TOC nav precedes `<main>` in DOM; `<h1>` lives outside `<main>` | Low |

---

## A11Y-1 — Modals & drawer have no focus trap, no focus move-in, no focus restore (High)

Evidence:
- `src/components/editor/ConfirmDialog.tsx:14-43` — renders `<div class="overlay"><div role="dialog" aria-modal="true">` but never calls `.focus()`, never traps Tab, never restores focus on close. No `onMount` at all.
- `src/components/AuthButton.tsx:92-138` — the sign-in `role="dialog" aria-modal="true"` modal is opened by `setOpen(true)` with no focus management; focus stays on the triggering "Sign in" button behind the scrim.
- `src/components/MainMenu.tsx:78-114` — the `nav.menu-drawer` opens with no focus moved into it and no trap; Tab walks straight back out to the page behind the scrim. Escape is wired (`onKey` at line 51-53) but focus is never sent into or restored from the drawer.

Why it matters: `aria-modal="true"` asserts the content outside is inert, but keyboard and screen-reader focus can leave the dialog (WCAG 2.4.3 Focus Order, 2.1.2 No Keyboard Trap inverse — here the trap is *missing*). A keyboard user opening "Submit this change" must blind-Tab through the whole page to reach the Confirm button; a screen-reader user is never told a dialog opened because focus didn't move. On close, focus is dropped to `<body>`, losing the user's place.

Fix: on open, move focus to the dialog (or its first focusable / close button); cycle Tab/Shift-Tab within the dialog; on close, restore focus to the element that opened it. A small shared `useFocusTrap(ref)` Solid primitive covers `ConfirmDialog`, `AuthButton`'s modal, and `MainMenu`. Consider migrating dialogs to the native `<dialog>` element + `showModal()`, which gives the trap, Escape, and background inertness for free.

---

## A11Y-2 — `ConfirmDialog` and the sign-in modal can't be dismissed with Escape (High)

Evidence:
- `src/components/editor/ConfirmDialog.tsx` — no keydown handler anywhere; the only dismissal is the "Back" button (`onCancel`, line 37). There is no scrim-click handler either, so clicking outside does nothing.
- `src/components/AuthButton.tsx:92-138` — the modal closes only via the close button (`onClick={() => setOpen(false)}`, line 99/117) or scrim button; no Escape handler.

(For contrast, `MainMenu.tsx:51-53` *does* handle Escape, so the pattern exists in the codebase but wasn't applied to the dialogs.)

Why it matters: Escape-to-close is an expected affordance for modal dialogs (WCAG 2.1.2 / common AAA pattern; users reasonably expect it). The publish-confirm dialog is on the primary edit path, so a keyboard user who opens it has no fast keyboard exit other than locating and tabbing to "Back" — which is also hard because of A11Y-1.

Fix: add a `keydown` listener (or rely on native `<dialog>`'s built-in Escape) that calls `onCancel` / `setOpen(false)`. `ConfirmDialog` should also dismiss on scrim click for parity with the sign-in modal.

---

## A11Y-3 — `--color-ink-subtle` text fails WCAG AA contrast in the default skin and dark themes (High)

Evidence (token values from `src/styles/tokens.css`):
- `src/styles/tokens.css:197` — wikigit (default skin) light: `--color-ink-subtle: #828990`. On `--color-surface #ffffff` = **3.54:1**; on `--color-canvas #f6f7f9` = **3.30:1** — both below the 4.5:1 AA threshold for normal text.
- `src/styles/tokens.css:233` — wikigit dark: `--color-ink-subtle: #767d85` on surface `#181c22` = **4.11:1** — fails.
- `src/styles/tokens.css:113` — wiki dark: `--color-ink-subtle: #72777d` on surface `#202122` = **3.57:1** — fails. (wiki light `#72777d` on white = 4.52:1, a hair over.)

This token is applied as a **text color** in 40+ rules, e.g. `src/styles/components.css:147,187,200,205,268,346` (search snippet, search keyboard hint, drawer descriptions, menu labels) and `src/styles/views.css:42,77,180,388,472,…`. It is also the input *placeholder* color role.

Why it matters: WCAG 1.4.3 Contrast (Minimum) requires 4.5:1 for body text and UI text under 18.66px. The failing color carries genuine content — search result snippets, page-meta hints, drawer item descriptions, field hints — not pure decoration. The default skin is the one most users see, and dark mode (an accessibility feature people enable *for* readability) is among the worst offenders.

Fix: darken `--color-ink-subtle` in wikigit light to ≥4.5:1 (e.g. `#6b7177` ≈ 4.6:1 on white) and lighten the dark variants (wikigit dark ≈ `#8a929b`, wiki dark ≈ `#8b9096`) until they clear 4.5:1 on their surface. Re-check the canvas pairing too (placeholders sometimes sit on `--color-canvas`). The wiki-skin light value is borderline — nudge it for margin.

---

## A11Y-4 — Async errors are not announced to assistive tech (Medium)

Evidence:
- `src/components/ui.tsx:20-26` — `ErrorNote` renders `<p class="editor-err">{props.msg}</p>` with no `role="alert"` / `aria-live`. It's the shared error surface used across the editor, focused editor, and admin flows.
- `src/components/Editor.tsx:410` — `<ErrorNote msg={error()} />` is how submit failures (rate-limit, 403, ban, network) surface; silently inserted.
- `src/components/NewPage.tsx:95-101` — the "page already exists" error `<p class="editor-err">` likewise has no live region; it appears as you type a taken slug but is never announced.

Contrast: `src/components/Editor.tsx:396` (progress) and `:416` (auto-revert) *do* use `role="status"`/`role="alert"`, so the codebase knows the pattern — it just isn't on the generic error path.

Why it matters: WCAG 4.1.3 Status Messages — an error that appears without a focus change must be in a live region or it's invisible to screen-reader users. A blind editor who hits a rate limit or a banned-hash 403 on publish gets no feedback at all.

Fix: give `ErrorNote`'s `<p>` `role="alert"` (assertive is appropriate for errors). Add `role="alert"` to the NewPage "taken" message and any admin-action error paragraphs.

---

## A11Y-5 — Duplicated `id="main"` across SPA-fallback branches (Medium)

Evidence:
- `src/components/Route404.tsx:48,62,73,78,83` — five separate `<main id="main">` elements in the same component's branch tree.
- `src/components/Admin.tsx:47,55` — two `<main id="main">` in one component.
- Each standalone page (`move.astro`, `cite.astro`, `special.astro`, etc.) plus `[...slug].astro:103` each render their own `<main id="main">`.

Within a single rendered page only one branch shows, so at runtime there is usually one `#main` — but `Route404`/`Admin` render conditional branches where, depending on the Show/Switch structure, more than one `<main>` can mount, and `id` must be unique per document (HTML validity; the skip link `href="#main"` at `src/styles/base.css` / `PageShell.astro:123` targets the first match).

Why it matters: Duplicate IDs are an HTML conformance failure and make in-page fragment navigation (`#main` skip link) ambiguous. Multiple `<main>` landmarks on one page violates the single-main-landmark expectation (ARIA landmark uniqueness), confusing landmark navigation in screen readers.

Fix: ensure exactly one `<main>` renders per route. In `Route404`/`Admin`, hoist a single `<main id="main">` wrapper outside the `Switch`/`Show` and let the branches fill its content, rather than each branch carrying its own `<main id="main">`.

---

## A11Y-6 — No RTL support despite 183 selectable translation languages (Medium)

Evidence:
- `src/layouts/PageShell.astro:89` — `<html lang={pageLang} …>` sets `lang` per page but never sets `dir`. No `dir` attribute is set anywhere in `src/` (grep for `dir=` returns only `flex-direction`).
- The W9 feature (`FEATURES.md` W9) made `/new`'s translate flow a `<select>` of "all 183 ISO 639-1 languages", and `src/components/LangBar.tsx` links to language-prefixed slugs like `/ar/…`, `/he/…`. So an Arabic or Hebrew page is reachable and will render with `<html dir>` defaulting to `ltr`.

Why it matters: WCAG 1.3.2 / 3.1.2 — RTL content rendered LTR is badly broken: punctuation flips, the float-right infobox lands on the wrong side, the left drawer and TOC are mirrored incorrectly. Since multi-language pages are a shipped, advertised capability (W3/W5/W9), this is a real gap, not hypothetical.

Fix: derive `dir` from the page language (maintain a small RTL set: `ar he fa ur ps sd ug yi …`, or use `Intl.Locale(...).textInfo.direction` where available) and emit `<html lang dir>` in `PageShell.astro`. Audit the float/drawer/TOC CSS for logical properties (`margin-inline-start`, `inset-inline`) so the layout mirrors. Acceptable to scope to "best-effort RTL" pre-release, but the `dir` attribute itself is cheap and high-value.

---

## A11Y-7 — Search combobox lacks combobox/aria-controls/activedescendant semantics (Medium)

Evidence:
- `src/components/Search.tsx:78-94` — the `<input>` has `aria-label` but no `role="combobox"`, no `aria-expanded`, no `aria-controls` pointing at the results, and no `aria-activedescendant` tracking the highlighted option.
- `src/components/Search.tsx:98-124` — results are `<div role="listbox">` with `<a role="option" aria-selected={…}>`. Keyboard arrow nav is implemented (`onFieldKey`, lines 47-60) and moves an `active` index, but that active state is never communicated to AT because there's no `aria-activedescendant` on the input and the options have no stable `id`.

Why it matters: WCAG 4.1.2 — a screen-reader user typing in the box is never told a listbox opened, how many results exist, or which option is "active" as they arrow through. The visual highlight (`is-active`) has no accessible counterpart.

Fix: make the input a real combobox: `role="combobox"`, `aria-expanded={open()}`, `aria-controls="search-listbox"`, `aria-autocomplete="list"`; give each option an `id` and set `aria-activedescendant` on the input to the active option's id. Add an `aria-live` count ("N results") for the result total.

---

## A11Y-8 — Figure alt text duplicated into the caption, announced twice (Low)

Evidence:
- `src/lib/figures.ts:19-30` — for an image-only paragraph, `const alt = inline.children[0].content` (the markdown alt text) is appended verbatim as the `<figcaption>` text (lines 25-29), but the original `<img>` token keeps that same string as its `alt` attribute (it is never cleared).

Why it matters: A screen reader announces the `<img alt>` *and then* the `<figcaption>` — the same text twice for every captioned figure. When alt and caption should differ (alt = what the image shows, caption = editorial label), this also conflates the two roles.

Fix: when promoting the alt into a `<figcaption>`, set the `<img>` `alt=""` (caption now provides the accessible name via the `<figure>`), or keep a distinct alt and only use the caption as supplementary text. The decorative-image pattern (`alt=""` on the img + visible `<figcaption>`) is the simplest correct fix.

---

## A11Y-9 — Tools dropdown misuses `role="menu"`/`role="menuitem"` on a `<details>` link list (Low)

Evidence:
- `src/layouts/PageShell.astro:200-213` — inside a native `<details>`, `<div class="menu" role="menu">` wraps `<a role="menuitem" href=…>` navigation links.

Why it matters: ARIA `menu`/`menuitem` imply an application menu with arrow-key roving focus and Home/End; here it's a list of plain links inside a disclosure. Screen readers will announce "menu" and expect roving behavior the component doesn't provide (the `<a>`s are normal Tab stops). This is a semantics mismatch, though the links remain operable.

Fix: drop the `role="menu"`/`role="menuitem"` and let the links be links inside the disclosure (a `<ul>` of `<a>` is fine). The native `<details>`/`<summary>` already provides correct expand/collapse semantics.

---

## A11Y-10 — Background content not inert while drawer/modal is open (Low)

Evidence:
- `src/components/MainMenu.tsx:59-61` — opening the drawer only sets `document.body.style.overflow = "hidden"` (scroll lock); the page behind is not marked `inert`/`aria-hidden`.
- `src/components/AuthButton.tsx` and `src/components/editor/ConfirmDialog.tsx` — overlays use `aria-modal="true"` but nothing makes the background `inert`, so SR virtual-cursor and Tab can still reach it (compounds A11Y-1).

Why it matters: `aria-modal="true"` is a promise that the rest of the page is inert; without `inert`/`aria-hidden` on the background, that promise is unkept and assistive tech may still read the page behind the dialog.

Fix: while a modal/drawer is open, set `inert` (or `aria-hidden="true"`) on the app root behind the portal, and remove it on close. Native `<dialog>.showModal()` does this automatically.

---

## A11Y-11 — TOC nav precedes `<main>`; page `<h1>` lives outside `<main>` (Low)

Evidence:
- `src/pages/[...slug].astro:103-117` — DOM order is `<main id="main">` → `.col-toc` (the `<nav aria-label="Contents">`, `src/components/Toc.tsx:10`) → `.col-main` (the article). So the Contents nav comes before the article body *inside* `main`.
- `src/layouts/PageShell.astro:142` — the page `<h1 class="page-title">` sits in `.page-head`, *outside* `<main>` (which begins later via the `<slot/>`). The article body's headings start at `<h2>` (`src/lib/toc.ts:17,23` only collects h2/h3), so the document's only `<h1>` is in the header region, not in `main`.

Why it matters: Putting the table-of-contents nav before the article content inside `main` means a screen-reader reading `main` top-to-bottom hits the section list before the prose (minor, but reverses Wikipedia's "content first, TOC aside" reading order). The `<h1>` being outside `<main>` is acceptable but means `main` has no top-level heading; the heading hierarchy for `main` starts at h2.

Fix: low priority. Optionally move the `<nav Contents>` after the article in DOM and reposition with CSS grid (`order`), so reading order is content-first. Confirm there is exactly one `<h1>` per page (there is) and that the article's h2 start is intentional (it is, mirroring Wikipedia). No action strictly required for conformance.

---

## Notes on things that are correct (so they aren't re-flagged)

- Skip link is present, visible-on-focus, and targets `#main` (`PageShell.astro:123`, `base.css:113-130`).
- `prefers-reduced-motion: reduce` is honored globally (`base.css:19-29`) — animations and smooth-scroll are neutralized; the drawer/menu animations inherit this.
- `prefers-color-scheme` is wired through the "Automatic" color option and a live `matchMedia` listener (`Appearance.tsx:56-62`); View Transitions are disabled (`PageShell.astro:113-118`), matching the "no cross-fade" intent.
- `:focus-visible` rings are defined globally with a token ring (`base.css:70-79`).
- Icon-only buttons are labeled: `MarkdownToolbar` (`aria-label` on every button), `MainMenu` menu button (`aria-label="Main menu"` + `aria-expanded`), close buttons, search icon (`aria-hidden` icon + input `aria-label`).
- Form fields in `PageProperties.tsx` and `NewPage.tsx` use wrapping `<label>`/`<fieldset><legend>` — properly associated; `aria-label` on the standalone edit-summary input (`Editor.tsx:332`).
- `LangBar` sets `lang` on each language link and `aria-current="page"` on the active one; native `<details>` keyboard support.
