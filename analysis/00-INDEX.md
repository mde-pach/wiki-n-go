# 00 — Deep Analysis Index & Executive Summary

## Project state (one paragraph)

Wikigit is a git-backed collaborative wiki (Astro static shell + Solid islands in
`src/`, a single Cloudflare Worker in `worker/src/`) in solid pre-release shape:
comment hygiene tracks CLAUDE.md, there is **no `any` anywhere**, the Worker router
is a clean dispatch map, the worker/governance test suite (300 tests / 41 files) has
real integration coverage of admin/lifecycle/publish paths, and the security
fundamentals that held up (JWT verify, OAuth CSRF state, slug/path-traversal
guards, maintainer-gate placement, multi-tenant KV isolation, gitignored secrets)
are sound. The real risk is concentrated in a few load-bearing defects: an
unsanitized infobox render path (stored XSS), an SSRF guard in `/cite` that is
string-only and follows redirects, trust/maintainer checks keyed on the display
*name* rather than the provider-qualified key, two genuine data-correctness bugs
(duplicate-heading section edits overwrite the wrong section; anon contribution
counts query the wrong GitHub field), and a heavy read-path bundle that ships the
editor + yaml + markdown to every reader. The frontend has **zero component/e2e
tests** even though the project's own changelog shows the dominant shipped-bug class
is SSR/hydration. Verification refuted or downgraded several frontend findings — see
the call-out below before acting.

## Confirmed Critical + High findings (cross-dimension)

**One Critical** surfaced — but only in the live Playwright pass ([report 10](10-runtime-playwright.md)).
The eight static dimensions could not reach it because it is a hydration-time
defect (it requires a real browser to render). The confirmed findings, after each
report's own verification pass:

| ID | Dimension | Title | Severity | One-line fix |
|----|-----------|-------|----------|--------------|
| RT-1 | Runtime | Full-page editor (`/edit/<slug>`) renders an **empty body for every existing page** — Solid `<textarea value={body()}>` SSR/hydration footgun (body SSR'd as a `value` attribute the browser ignores; hydration never repaints it) | **Critical** | Bind `prop:value={body()}` or set via the `ta` ref in a `createEffect`; apply defensively to `FocusedEditor`/`Composer` |
| SEC-1 | Security | Stored XSS: infobox `link`/`image` frontmatter rendered unsanitized (server + client) | High | Scheme-allowlist `link`/`image` and run composed infobox HTML through DOMPurify on both paths |
| SEC-2 | Security | `/cite` SSRF guard defeatable via DNS rebinding, decimal/octal/IPv6 literals, redirects, metadata | High | Block all IP literals + non-http(s), set `redirect:"manual"`, re-check each hop |
| SEC-3 | Security | Maintainer takeover: trust keyed on display `name`, so a Wikigit handle can impersonate the owner | High | Key trust/maintainer checks on provider-qualified `writer.key` (`gh:`/`wg:`), not `name` |
| FE-1 | Frontend | Module caches (`pageSet`/history/previews/transclude) never invalidated across View Transitions → stale content after an edit | High | Clear the session caches on `astro:after-swap`, or key them on latest SHA |
| FE-5 | Frontend | `findSection` matches headings by slug only → duplicate headings edit/overwrite the wrong section (data loss) | High | Make `findSection` disambiguation-aware (occurrence counter / DOM index), unit-test duplicate `##` |
| WB-1 | Worker | Anon `/contributions` queries GitHub `?author=<name>` (no match) while trust queries `?author=<email>` → empty history, surfaces disagree | High | Query by `<email>` in `contributions.ts` (it already computes it); test N-commit anon parity |
| WB-3 | Worker | Concurrent same-author edits to one slug race on branch creation → 502 instead of reconciling | High | Treat ref-create 422 as "branch exists" and fall through to the update path |
| CQ-1 | Code quality | Repo-JSON-list moderation handlers (bans/rights/suppress) are near-identical copies | High | Extract a typed `mutateList` repo-JSON store helper; ~120 lines removed |
| CQ-2 | Code quality | Frontmatter parsing forked into 3 regexes + 2 parsers across the boundary | High | One canonical `frontmatter` module imported by both build targets |
| CQ-3 | Code quality | Five admin tabs hand-roll the same list+form+remove island | High | Use existing `useSubmit`/`clientResource` + extract a `ListManager` |
| PERF-1 | Performance | WikiPage statically imports the whole editor stack onto the read path | High | Lazy-load `FocusedEditor` via Solid `lazy()` inside `<Suspense>` |
| PERF-2 | Performance | `yaml` (30 KB gz) ships on the read path to re-parse frontmatter the server already parsed | High | Hand-roll a tiny frontmatter parser or move `yaml` behind the lazy editor chunk |
| PERF-3 | Performance | Read path unconditionally refetches SSR'd content via `/latest`→jsDelivr waterfall on every load | High | Defer revalidation off `onMount`; fetch the build-SHA blob from cache, diff-before-swap |
| PERF-4 | Performance | Worker JSON read endpoints emit no `Cache-Control`/`s-maxage` — zero edge caching | High | Add per-endpoint `s-maxage`+`stale-while-revalidate`; drop client `no-store` on `/pages`/`/latest` |
| GAP-1 | Spec/feature | `protection`/ban `expires` missing — temp protection/blocks impossible | High | Add optional `expires` to bans + `protection:` frontmatter; lazy expiry at read time |
| GAP-2 | Spec/feature | FEATURES §M "RecentChanges" marked ⬜ P0 but is fully shipped (worst status drift) | High | Flip the row to ✅ and reconcile the §M critical-path checklist |
| GAP-3 | Spec/feature | Minor-edit flag claimed 🟡 but has zero implementation | High | Either downgrade to ⬜ or implement (checkbox → `Minor:` trailer → tag → filter) |
| GAP-4 | Spec/feature | Watchlist / notifications / email / Thanks entirely unbuilt, blocked on unstarted M10 Hub | High | Record the real blocked-not-deferred dependency edge in SPEC; decide an anon fallback |
| TEST-1 | Test coverage | `verifyPow` — the only bot/abuse gate — has zero test coverage (enforced path never executed) | High | Add `worker/src/moderation.test.ts`: bits/skew/expiry/replay + client↔server solve cross-check |
| TEST-2 | Test coverage | SSRF guard tested with one happy case; known bypass classes unverified | High | `cite.test.ts` asserting decimal/hex/IPv6 + redirect-to-private rejection (doubles as SEC-2 spec) |
| TEST-3 | Test coverage | OAuth sign-in flow (login/callback/state/return-guard) has no test | High | `identity/auth.test.ts`: state round-trip, `isAllowedReturn`, callback redirect/hash |
| TEST-4 | Test coverage | Discussion threading (reply-to tree rebuild) — core Talk feature — untested | High | Unit-test the tree rebuild over mixed `anon:`/`gh:`/`reply-to:` markers + worker integration |
| TEST-5 | Test coverage | Zero browser/e2e tests: no anon edit→PR→merge or sign-in journey verified | High | Add a small (5–8 spec) Playwright smoke suite wired into `verify` |
| A11Y-1 | Accessibility | Modals & drawer have no focus trap, no focus move-in, no focus restore | High | Shared `useFocusTrap`, or migrate dialogs to native `<dialog>` + `showModal()` |
| A11Y-2 | Accessibility | `ConfirmDialog` and sign-in modal can't be dismissed with Escape | High | Add keydown→cancel (or native `<dialog>`); dismiss on scrim click |
| A11Y-3 | Accessibility | `--color-ink-subtle` text fails WCAG AA contrast (default + dark skins) | High | Darken/lighten the token per skin until ≥4.5:1 on its surface |

**Confirmed High count: 26, plus 1 Critical (RT-1, runtime).**

## ⚠️ Findings that verification REFUTED or DOWNGRADED — do NOT act on as High

These appeared in the dimension summary tables but the appended verification pass
overturned them. Acting on them as written would be wasted or wrong effort:

- **FE-2 (whoami stale identity) — DOWNGRADED to Low.** The in-page race is prevented:
  `TokenCapture` is an inline `<head>` script that runs before any island hydrates,
  and both auth transitions force a full reload. Only the cross-tab edge remains
  (low impact). The inline comment at `solid.ts:64` ("Worker reads it from the
  cookie") is factually wrong (it's a bearer token from localStorage) — fix the
  comment, not the architecture.
- **FE-3 (AuthBoot flash on SPA nav) — REFUTED.** The header has `transition:persist`
  (`PageShell.astro:124`), so the live `client:only` `AuthButton` island is not torn
  down across swaps and keeps painting the signed-in avatar. No flash window exists.
- **FE-4 (NDJSON terminal frame dropped) — REFUTED.** The sole producer
  (`http.ts:83`) always writes a trailing `\n` after every event including `{type:"done"}`,
  and `reader.read()` never drops bytes, so the parse loop always returns the result
  before the post-loop throw. A defensive tail-flush is mild hygiene, not a defect.
- **WB-2 (divergent `trust:` cache key) — DOWNGRADED to Medium.** Real mechanism, but
  for the dominant signed-in GitHub case both query forms resolve to the same account
  and count; divergence needs edge conditions. (Note: a sharper unflagged variant —
  Wikigit-provider users' `wg-<id>@users.wikigit.invalid` also failing `?author=<login>`
  in contributions — is worth folding into the WB-1 fix.)

## Counts per dimension

| # | Report | Findings | High (confirmed) | Medium | Low |
|---|--------|----------|------------------|--------|-----|
| 01 | [Security](01-security.md) | 10 | 3 (SEC-1,2,3) | 3 | 4 |
| 02 | [Frontend bugs](02-frontend-bugs.md) | 12 | 2 confirmed (FE-1,5); 1 refuted, 1 refuted, 1 downgraded | 4 | 3 |
| 03 | [Worker bugs](03-worker-bugs.md) | 10 | 2 confirmed (WB-1,3); WB-2 → Medium | 4 (incl. WB-2) | 3 |
| 04 | [Code quality](04-code-quality.md) | 10 | 3 (CQ-1,2,3) | 4 | 3 |
| 05 | [Performance](05-performance.md) | 10 | 4 (PERF-1,2,3,4) | 4 | 2 |
| 06 | [Test coverage](06-test-coverage.md) | 10 | 5 (TEST-1,2,3,4,5) | 4 | 1 |
| 07 | [Spec/feature gaps](07-spec-feature-gaps.md) | 14 | 4 (GAP-1,2,3,4) | 6 | 4 |
| 08 | [Accessibility/UX](08-accessibility-ux.md) | 11 | 3 (A11Y-1,2,3) | 4 | 4 |
| 10 | [Runtime / Playwright](10-runtime-playwright.md) | 6 | 1 Critical (RT-1) | 2 (RT-2,3) | 3 |

**Total findings: 93. Confirmed High: 26. Critical: 1 (RT-1).**

The runtime pass (10) also gives independent live corroboration of A11Y-1/A11Y-2
(RT-2: the sign-in modal has no focus trap, no focus move-in, and ignores Escape)
and of PERF-3/PERF-5 (RT-3: the live 7-call read-path Worker waterfall).

## Report links

- [01-security.md](01-security.md)
- [02-frontend-bugs.md](02-frontend-bugs.md)
- [03-worker-bugs.md](03-worker-bugs.md)
- [04-code-quality.md](04-code-quality.md)
- [05-performance.md](05-performance.md)
- [06-test-coverage.md](06-test-coverage.md)
- [07-spec-feature-gaps.md](07-spec-feature-gaps.md)
- [08-accessibility-ux.md](08-accessibility-ux.md)
- [10-runtime-playwright.md](10-runtime-playwright.md) — live browser pass (RT-1 Critical editor bug + a11y/perf corroboration)
- [09-ROADMAP.md](09-ROADMAP.md) — prioritized, de-duplicated action plan
