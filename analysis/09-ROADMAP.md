# 09 — Prioritized Roadmap (de-duplicated action plan)

Grouped P0 (correctness/security, fix now) → P1 (high-leverage quality/perf/tests)
→ P2 (features/spec gaps). Effort: S ≈ <½ day, M ≈ 1–2 days, L ≈ 3+ days.
Where multiple dimensions point at one root cause, items are **merged** and the
contributing finding IDs listed. Refuted/downgraded findings (FE-2, FE-3, FE-4,
WB-2) are deliberately excluded from P0 — see 00-INDEX.md.

> **Backend pivot context (M11).** The backend is moving off the single Cloudflare
> Worker onto a portable **Bun server** (no-DB: memory + git; wikigit.org central +
> self-hostable). Plan: [`11-portable-backend-plan.md`](11-portable-backend-plan.md).
> Items tied to Cloudflare primitives are flagged **🔁** below and reframed for the
> portable runtime. **The P0 security/correctness fixes are runtime-agnostic** — do
> them on the current Worker now; they carry to Bun untouched, so M11 is not a reason
> to defer them.

---

## P0 — Fix now (correctness & security)

### P0-0 — Fix the empty editor textarea (core editing is broken) — **S** 🔴 Critical
The full-page editor (`/edit/<slug>`) renders an **empty Markdown body and empty
preview for every existing page**. `src/components/Editor.tsx:305` uses
`<textarea value={body()}>`; Solid SSRs that as a `value` **attribute**, which HTML
textareas ignore (they render only child text), and hydration never assigns the
`.value` property — so the box paints empty even though `body()` holds the full
document. Confirmed in built `dist` output and live; isolated by the fact that the
*client-created* `FocusedEditor` (same JSX, no SSR) works. Fix: `prop:value={body()}`,
or drive from the ref — `createEffect(() => { if (ta && ta.value !== body()) ta.value = body(); })`.
Apply the same to `FocusedEditor.tsx:117` and `discussion/Composer.tsx:40`
defensively (they work today only because they are client-created). Add the
Playwright assertion from P1-6 (open editor → `textarea.value` contains the body) so
this never regresses silently.
*Why:* in-site editing is the product's entire premise; right now every contributor
who clicks **Edit** on an existing page is shown a blank editor — confusing and a
data-integrity hazard. Smallest fix, highest user impact.
*Sources:* **RT-1** (report 10). Root cause is the SSR/hydration class the changelog
shows is this project's dominant shipped-bug type — which is also why P1-6's smoke
suite matters.

### P0-1 — Sanitize the render path; the infobox is a live stored-XSS vector — **M**
Scheme-allowlist `link`/`image` frontmatter (`/^(https?:|\/|mailto:)/i`) in
`src/lib/infobox.ts`, and run the *composed* infobox HTML through DOMPurify on the
**client** (sanitize `withInfobox(...)` output, not just the body) **and** through an
isomorphic sanitizer on the **SSR/build path** so server and client share one trust
boundary. Treat any HTML built by a custom markdown-it rule as untrusted.
*Why:* a single anon edit yields `<a href="javascript:…">` that runs for every
reader and can steal the localStorage session JWT; the SSR path has no sanitizer at
all, so any future raw-HTML rule silently becomes XSS.
*Sources:* **SEC-1**, SEC-4. Related latent surface: FE-11 (preview cards built by
string concat → prefer DOM APIs).

### P0-2 — Harden the `/cite` SSRF guard — **M**
In `worker/src/handlers/cite.ts`: reject non-http(s) and all IP literals (normalize
decimal/octal/hex/IPv6 first), set `redirect:"manual"` and re-validate the
`Location` of each hop (or cap to a small citation-host allowlist). Land the
verification tests as the executable spec.
*Why:* the current guard is a string regex on the hostname that DNS-rebinding,
decimal/IPv6 literals, and a 30x→`169.254.169.254` all defeat; the Worker holds
GitHub App creds.
*Sources:* **SEC-2**, **TEST-2** (write the bypass tests alongside the fix).

### P0-3 — Key trust/maintainer on the provider-qualified `writer.key`, not display `name` — **S/M**
In `worker/src/trust.ts` (`editorTier`/`requireMaintainer` path) compare against
`writer.key` (`gh:login`, `wg:sub`). Store `trusted-editors.json` entries and the
`REPO_OWNER` comparison as qualified keys; reserve `name === REPO_OWNER` to the
GitHub provider.
*Why:* today a self-registerable Wikigit handle equal to `REPO_OWNER` or a
`trusted-editors.json` entry is granted maintainer cross-provider — privilege
escalation to sysop. Also fixes the linked SEC-8 leak (don't grant maintainer to a
bare `anon-<hash>`).
*Sources:* **SEC-3**, SEC-8.

### P0-4 — Fix duplicate-heading section edits (silent data loss) — **S/M**
Make `findSection` (`src/lib/editor-section.ts`) disambiguation-aware: track a
per-slug occurrence counter matching markdown-it-anchor's `slug-N` scheme, or pass
the heading DOM index / char offset instead of re-slugifying. Unit-test a doc with
two identically-titled `##` sections.
*Why:* clicking `[edit]` on the second of two same-titled headings opens and then
overwrites the **first** section — content corruption routed through the normal
auto-merge pipeline.
*Sources:* **FE-5**.

### P0-5 — Invalidate session caches on SPA navigation — **S**
Add one shared `astro:after-swap` listener that resets `manifest` (`cache =
undefined`), the `history` map, the `previews` maps, and `transcludeCache` (or key
them on the latest SHA from `resolveLatestSha()`).
*Why:* after an edit, a freshly created page stays a red link and search/previews/
revision counts stay stale on every other page until a hard reload, because the SPA
never tears the module graph down.
*Sources:* **FE-1**.

### P0-6 — Reconcile concurrent same-author branch creation (422 → 502) — **S**
In `worker/src/handlers/content.ts`, treat a 422 "Reference already exists" on the
ref-create as "branch exists" and fall through to the read-file-sha + PUT update
path (add an allow-conflict flag to `gh()` or catch+retry).
*Why:* two concurrent submits (double-click / two tabs) to the same slug both see
`ref === undefined`; the loser 502s, defeating the documented idempotency guarantee.
*Sources:* **WB-3**. Adjacent: WB-5 (skip the PUT when branch content already
matches — fold in to avoid empty/duplicate commits that also inflate trust counts).

### P0-7 — Make anon `/contributions` query the same field as trust — **S**
In `worker/src/handlers/contributions.ts`, query `?author=<email>` (the value it
already computes) instead of the bare `author`/login. Centralize the `(name, email)`
derivation in one helper shared with `editorTier`. Add a parity test (anon with N
commits reports N on both surfaces). Fold in the WB-2 Wikigit variant
(`wg-<id>@…wikigit.invalid`).
*Why:* GitHub `?author=` matches email-or-login, never the git author *name*, so an
anon profile shows an empty history while its trust tier is non-zero.
*Sources:* **WB-1**, WB-2 (downgraded — handle in the same helper).

### P0-8 — Cover the abuse gate: `verifyPow` + rate-limit/3RR tests — **S/M**
Add `worker/src/moderation.test.ts`: `leadingZeroBits` on crafted bytes; `verifyPow`
accept/expire/skew/insufficient-bits/replay; a client↔server cross-check that
`src/lib/pow.ts solvePow(n)` passes `verifyPow` at `POW_BITS=n`; and the
rate-limit/3RR/autopatrol KV boundaries (Nth allowed, N+1th 429).
*Why:* the only replacement for Turnstile has **zero** test coverage — the enforced
path is never executed by any test, so a regression silently disables bot protection.
*Sources:* **TEST-1**, TEST-10. Consider raising the SEC-5/SEC-6 fixes (bind PoW to
request+writer, fail closed when KV is unbound) into the same change.

### P0-9 — Test the OAuth round-trip (open-redirect + CSRF state) — **S/M**
`worker/src/identity/auth.test.ts`: `signState`↔`verifyState` round-trip + tamper/
expiry rejection; `isAllowedReturn` accepts configured origin + `*.wikigit.org`,
rejects foreign/non-URL; `authCallback` issues a verifiable session and 400s on bad
state.
*Why:* the entire sign-in path is untested and two security-critical guards
(open-redirect that leaks the session JWT in `dest.hash`, CSRF state) have no
regression net. Pair with SEC-9 (fail closed when `ALLOWED_ORIGIN` unset).
*Sources:* **TEST-3**, SEC-9.

---

## P1 — High-leverage (quality, performance, tests)

### P1-1 — Lazy-load the editor/yaml/markdown off the read path — **M**
`lazy(() => import("./editor/FocusedEditor"))` inside `<Suspense>`, gated on
`sectionEdit()`. Move `splitFrontmatter`/`withFrontmatter` into that chunk (or
replace `yaml` with a ~30-line frontmatter parser). Gate the markdown bundle behind
the lazy paths (revision view, transclusion expand, editor) so byte-identical reads
don't re-render.
*Why:* the read path ships ~9–10 KB gz of editor code, ~30 KB gz of `yaml`, and
~62 KB gz of markdown-it+DOMPurify to readers who never edit. Mermaid already proves
the lazy pattern works here.
*Sources:* **PERF-1**, **PERF-2**, **PERF-7**.

### P1-2 — Stop the redundant read-path content waterfall — **S/M**
Defer the `onMount` revalidation off the critical path (`requestIdleCallback`),
fetch the build-SHA blob from immutable jsDelivr cache first, and only swap when
`/latest` reports a newer SHA (the diff-before-swap already exists). Pairs with
P1-1: with no on-mount re-render, the markdown bundle leaves the modulepreload set.
*Why:* every read does a sequential `/latest`(no-store)→jsDelivr round-trip for
content already in the SSR'd HTML, usually discarding a byte-identical result.
*Sources:* **PERF-3**, PERF-5, **RT-3** (live-measured: 7 Worker calls + content
fetch on a single home load).

### P1-3 — Add HTTP cache headers to backend JSON reads — **S** 🔁
In `worker/src/http.ts` `json()`, set per-endpoint `Cache-Control`: `/pages` &
`/link-graph` → `public, s-maxage=60, stale-while-revalidate=600`; `/latest` →
`public, s-maxage=15, swr=60`; keep `/whoami` & `/patrol-status` `private, no-store`.
Drop the client `cache:"no-store"` on `/pages`/`/latest`.
*Why:* no read-path JSON is cacheable today; the in-memory/KV layer already makes
these safe to cache (the edge-SSR content route already does exactly this).
*🔁 M11 reframe:* the mechanism is portable — on the Bun server these are standard
HTTP `Cache-Control` honored by a **reverse proxy or optional CDN in front**, not CF
edge KV. Same headers, vendor-neutral. Do it now on the Worker; it carries over.
*Sources:* **PERF-4**. Adjacent: PERF-9 (skip `/whoami` entirely for readers with no
session/cached-maintainer signal).

### P1-4 — Extract the repo-JSON-list store + frontmatter module — **M**
(a) A typed `mutateList<T>` helper for bans/rights/suppress (load→parse→mutate→
commit→audit), collapsing the three near-identical handlers (~120 lines). (b) One
canonical `frontmatter` module imported by both `trust.ts` and `indexlib.ts` (and
shared with the app), eliminating the 3-regex fork.
*Why:* CQ-1 is the biggest worker factorization win and CQ-2's regex drift is a
latent **protection-bypass** class (the index builder and the trust gate parse
frontmatter slightly differently). Both also unblock the shared-types work.
*Sources:* **CQ-1**, **CQ-2**, CQ-6 (add a type-only `shared/`), CQ-7 (move
`movePage` beside merge/split; one `redirectStub`).

### P1-5 — Use the existing island abstractions in the admin tabs — **S/M**
Convert `Bans`/`Suppression`/`Rights` (and `Move`/`Merge`/`Split`) to the existing
`useSubmit` + `clientResource`; extract a `ListManager`/`useListResource` for the
list+form+remove pattern. Replace the 5 inline `createResource(() => isServer ?
undefined : true, fn)` with `clientResource`. Model `EditResult`/`StreamEvent` as
discriminated unions (CQ-4) once `shared/` exists.
*Why:* the abstractions already exist (`useSubmit`, `clientResource`) but aren't
used consistently; the fix is to *use them more*, removing ~5 islands' worth of
duplicated busy/error wiring and the inconsistent SSR guards (a real hydration risk).
*Sources:* **CQ-3**, CQ-5, CQ-4, CQ-8 (`queryParam` helper), CQ-9, CQ-10.

### P1-6 — Add a thin Playwright smoke suite + the highest-value unit gaps — **M**
5–8 deterministic specs (stubbed Worker) wired into `verify`: anon edit→PoW→publish
progress→updated; redlink→`/new`→seeded editor; sign-in renders signed-out at first
paint then avatar with a seeded session (the W8 regression); Talk post+nested reply;
`/admin` gated for anon vs maintainer. Add `linkgraph.test.ts` (mirror
`indexlib.test.ts`, shared fixtures), `search.test.ts`, discussion-threading unit
tests, and trust-tier boundary tests.
*Why:* the project's own changelog shows the dominant shipped-bug class is
SSR/hydration/blink in islands — exactly what unit/worker-fetch tests structurally
cannot reach. A small smoke suite is the single highest-leverage test addition.
*Sources:* **TEST-5**, **TEST-4**, TEST-6, TEST-7, TEST-8, TEST-9.

### P1-7 — Accessibility: dialogs, contrast, live regions — **M**
Migrate `ConfirmDialog`/`AuthButton` modal/`MainMenu` drawer to native `<dialog>` +
`showModal()` (free focus trap, Escape, background inertness) or a shared
`useFocusTrap`. Darken/lighten `--color-ink-subtle` per skin to ≥4.5:1. Give
`ErrorNote` `role="alert"`. Make the search input a real combobox
(`aria-activedescendant`/`aria-controls`/`aria-expanded`).
*Why:* the publish-confirm dialog is on the primary edit path with no keyboard exit,
failing contrast hits the default skin's body text, and async errors (rate-limit,
ban) are silent to screen readers.
*Sources:* **A11Y-1**, **A11Y-2**, **A11Y-3**, A11Y-4, A11Y-7, A11Y-10, **RT-2**
(live-confirmed: sign-in modal keeps focus on the trigger and ignores Escape).

### P1-8 — Lower-risk worker/frontend correctness cleanups — **S**
Fold these single-file fixes into the relevant P0/P1 changes: WB-4 (preserve `ts`
when patching `meta:index` so the safety rebuild still fires); WB-7 (restrict
`revertRisk`'s +20 to a known risk-tag set, not "any tag != edit-war"); WB-8 (anchor
the DOI regex at the start); WB-9 (read bans/trusted-editors via the authenticated
contents API, not the ~5-min raw CDN); FE-6/FE-7/FE-8/FE-9 (focused-edit baseline
staleness, revert-vs-draft `activeDraftId`, `PatrolMeta` disposed-flag, template/draft
precedence); SEC-7 (assert `alg`/`typ` on the session JWT).
*Sources:* WB-4, WB-5, WB-7, WB-8, WB-9, WB-10, FE-6, FE-7, FE-8, FE-9, FE-10,
FE-12, SEC-5, SEC-6, SEC-7, SEC-10.

---

## P2 — Later (features & spec gaps)

### P2-1 — Reconcile the tracker docs with reality — **S**
Flip FEATURES §M RecentChanges ⬜→✅; rewrite the §M / SPEC critical-path checklist
(items shipped/removed are listed as pending); downgrade or split the minor-edit
flag row (claimed 🟡, is 0%); strike the *done* Accounts persistent-volume follow-up
(cite `accounts/Dockerfile`); flip §N ban-reason ⬜→🟡; fix the `DEFAULT_EDIT_TIER`
"protection.json" comment; note the `wiki-n-go` infra-id intentionality in README.
*Why:* the drifted checklist is the source of the worst status finding (GAP-2) and
will mislead the next contributor into rebuilding shipped work or "fixing" done work.
*Sources:* **GAP-2**, GAP-3, GAP-5, GAP-12, GAP-13.

### P2-2 — Temporary protection & bans (`expires`) — **M**
Add optional `expires` (ISO) to `NormalBan` and the `protection:` frontmatter parse;
treat expired entries as absent at read time (lazy expiry, no cron); surface a
duration picker in the `/admin` Blocks/Protection tabs.
*Why:* every protection and ban is currently indefinite; temp semi-protection and
short vandalism blocks (Wikipedia's overwhelming default) are impossible. Most-
repeated TODO in the tracker.
*Sources:* **GAP-1**.

### P2-3 — Close the post-filter-removal spam hole — **S/M**
Decide and document where spam control lives. Cheapest fit: a versioned
`spam-domains.txt` checked in `prepareEdit` (the gate the removed AbuseFilter
occupied). If the answer is truly post-hoc-only, say so and drop the §M P0/P1
blacklist rows to post-v1.
*Why:* autonomous mode auto-merges trusted-tier edits with **no content gate**; a
spammer clearing the IP-rotatable auto-confirm threshold publishes live links with
nothing checking the diff.
*Sources:* **GAP-10**.

### P2-4 — Trailing-run rollback — **M**
Add a "rollback to before this author's run" mode to `revertCommit` (walk back
consecutive same-author commits on a page, restore to the pre-run state as one
revert). Reuses the existing primitive.
*Why:* per-commit revert means undoing a 5-edit vandal takes 5 actions; one-click
run rollback is the core anti-vandalism affordance.
*Sources:* **GAP-7**.

### P2-5 — Suppression: private log + purge runbook; privacy hardening — **S/M**
Split suppress/unsuppress audit entries out of the public `audit-log.jsonl` into a
maintainer-only log (or omit the suppressed value); document the manual hard-purge
runbook; until purge exists, don't let the UI imply content is gone. Separately, add
an optional time-epoch to the `ip_hash` HMAC input (env-tunable, default off) or
soften the "stronger than Wikipedia" privacy claim; widen the 32-bit truncation.
*Why:* suppressed text is only relabeled in API responses (still public in git@sha);
the public audit log defeats suppression's purpose; the fixed salt makes anon
pseudonyms permanently linkable, the one place the privacy claim outruns the code.
*Sources:* **GAP-8**, GAP-9, SEC-8, SEC-10.

### P2-6 — Unblock the account-path feature set (M10) — **L**
Scope the M10 Hub + dogfood/main-instance wiring (the genuine remaining M10 work);
wire the canonical issuer config default so "Sign in with Wikigit" is live; decide
the `wg:` handle uniqueness policy before profiles open to wg users. This is the
prerequisite for watchlist / notifications / email / Thanks — record that as a
blocked-not-deferred edge and decide a minimal anon-friendly "watch" fallback.
*Why:* watchlist + "you were reverted/replied-to/thanked" is the #1 retention
feature; today there is no inbox of any kind. Correctly P2 but gated on unstarted M10.
*Sources:* **GAP-4**, GAP-5, GAP-14, GAP-6 (decide CODEOWNERS in/out of v1).

### P2-7 — Search ranking quality — **S**
Add body term-frequency and a small recency boost; document the current title-
weighted ranking as v1 in FEATURES.
*Sources:* GAP-11.

### P2-8 — Runtime polish & first-run hygiene — **S**
- Add a favicon / app icon (or a `<link rel="icon">` in `PageShell`) — every page
  currently logs a `favicon.ico` 404 (**RT-4**).
- Replace the flagship infobox's hotlinked `duckduckgo.com` image
  (`content/index.md:15`) with a repo-hosted asset, and add a broken-image fallback
  in the infobox/figure renderer (**RT-5**).
- Add a clean-clone `bun install && bun run build` CI check — a fresh checkout was
  broken because `iso-639-1` was declared but not installed (**ENV-1**).
*Sources:* RT-4, RT-5, ENV-1 (report 10).

---

---

## Milestone M11 — Portable backend (Bun, no-DB, self-hostable) — **L**

A distinct initiative (not a finding-fix), sequenced **after the P0 correctness/
security fixes** so the move carries clean code, not bugs. Full design + migration:
[`11-portable-backend-plan.md`](11-portable-backend-plan.md). Phases:
- **M11.1 — Store interface + `MemoryKV`** (S/M): extract the `namespacedKV` shape
  into a `Store` interface; in-memory Map+TTL impl; parity tests.
- **M11.2 — Bun runtime** (M): wrap the `fetch` router in `Bun.serve`; `env` from
  `process.env` + `MemoryKV`; `waitUntil`→tracked fire-and-forget drained on
  `SIGTERM`; port the worker suite.
- **M11.3 — Durable moderation log** (S/M): patrol/tags → `.wikigit/moderation.jsonl`
  (git append-log, boot-hydrated), reusing the `audit-log.jsonl` commit path.
- **M11.4 — Frontend `serverUrl`** (S): rename `config.workerUrl`→`serverUrl`
  (`PUBLIC_API_URL`); no contract change.
- **M11.5 — Deploy/ops** (S/M): `bun run start` + `systemd`/Caddy(TLS) sample + env
  reference; run on Coolify beside `accounts/`.
- **M11.6 — Retire CF surface** (S): drop the Deploy-to-Cloudflare wizard, Workers
  Builds, `wrangler.toml`, KV bindings, `EDGE_SSR=cloudflare`; PKCE-watch dropped;
  Cloudflare kept only as a documented "advanced" host.
*Scale note:* vertical-first (writes are low-volume; reads are CDN), shard-by-tenant
(`repo → process`) as the no-DB-preserving exit if one box isn't enough.

## Cross-cut root-cause merges (where dimensions converged)

- **Unsanitized hand-built HTML → `innerHTML`** is one root cause behind SEC-1, SEC-4,
  and FE-11 (infobox + preview cards). Fix once with a shared sanitize boundary (P0-1).
- **SSRF guard** is both a security defect and a test gap: SEC-2's fix and TEST-2's
  tests are the same change (P0-2).
- **GitHub `?author=` name-vs-email** drives both WB-1 and WB-2; one shared
  `(name,email)` derivation helper fixes both (P0-7).
- **Read-path bundle weight** (PERF-1/2/7) and **redundant refetch** (PERF-3/5) are
  the same lazy-loading root cause; fixing the refetch removes the markdown bundle
  from the critical path (P1-1 + P1-2).
- **Duplicated island/handler wiring** spans CQ-1/2/3/5/6/7 and the SSR-guard
  inconsistency in CQ-8 — one factorization pass (P1-4 + P1-5) clears the cluster.
- **Missing dialog primitives** (A11Y-1/2/10) all dissolve by adopting native
  `<dialog>` + `showModal()` (P1-7).
- **Tracker-doc drift** (GAP-2/3/5/12/13) is one documentation pass (P2-1); GAP-2's
  checklist is the upstream source of several status errors.
