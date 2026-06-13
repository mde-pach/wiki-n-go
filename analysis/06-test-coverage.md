# Test Coverage & User-Path Coverage Audit — Wikigit

**Scope:** map what the 300-test / 41-file vitest suite covers, find untested or thinly-tested
critical paths, and recommend the highest-leverage tests to add. Pre-release weighting: real
defect-catching gaps over production-hardening theater.

**Toolchain found:** `vitest run` only (`package.json:14`). `verify` = `biome + vitest + astro build + worker verify`
(`package.json:15`). **No Playwright dependency, no `playwright.config.*`, no `e2e/`** (confirmed: `NO playwright dep`).
**No Solid component tests** anywhere under `src/components/**` (every `*.test.ts` lives in `src/lib` or `worker/src`).

---

## Coverage inventory (what the 41 files actually exercise)

**Worker — well covered.** Admin/governance endpoints have real integration coverage (request → router →
GitHub-API-stubbed → assertions): `/ban`×5, `/unban`×3, `/rollback`×7, `/restore`×4, `/protect`×3, `/grant`×2,
`/revoke`×2, `/delete`×4, `/tag`×4, `/move`×4, `/merge`×10, `/split`×4, `/suppress`×4. Publish path
(`publish.integration.test.ts`) covers trusted auto-merge, conflict-stays-open, untrusted-opens-PR,
idempotent no-op, and PR reuse. Multi-tenant isolation has both unit (`tenant.test.ts`) and integration
(`tenant.integration.test.ts`) coverage including keyspace disjointness and per-repo bans. Pure logic
(`trust`, `risk`, `editwar`, `protection`, `suppression`, `autopatrol`, `indexlib`, `citelib`, `githubApp`,
`automod`, `identity/writer`) is unit-tested.

**Frontend — thinly covered.** 15 `src/lib` test files cover the pure transforms: `markdown`, `wikilink`,
`decorate`, `diff`, `categories`, `citetemplate`, `transclude`, `templates`, `lifecycle`, `editor-section`,
`draft`, `ssr`, `setup`, plus `api` (streaming submit) and `lib`. **31 of ~46 `src/lib` modules have no test
file at all** (including `search`, `linkgraph`, `pow`, `comments`, `thread-store`, `toc`, `history`,
`contributions`, `changes`, `curation`, `review`, `move`, `frontmatter`, `infobox`, `previews`).

The findings below rank the *gaps that can hide real defects*, not the long tail of trivial untested modules.

---

## Summary

| ID | Title | Severity |
|----|-------|----------|
| TEST-1 | No test exercises `verifyPow` — the only bot/abuse gate has zero coverage | High |
| TEST-2 | SSRF guard (`assertFetchableUrl`) tested with one happy case; known bypasses unverified | High |
| TEST-3 | OAuth sign-in flow (`auth.ts`: login/callback/state/return-guard) has no test | High |
| TEST-4 | Discussion threading (reply-to tree rebuild) — core Talk feature, untested | High |
| TEST-5 | Zero browser/e2e tests: no full anon edit→PR→merge or sign-in journey is verified end-to-end | High |
| TEST-6 | Full-text `search()` ranking/highlight untested despite being a primary read path | Medium |
| TEST-7 | No Solid component tests: Editor/Discussion/Admin/AuthButton logic unverified | Medium |
| TEST-8 | `linkgraph.ts` (client special-pages keystone) untested; only the worker `indexlib` twin is | Medium |
| TEST-9 | Trust-tier *transition* boundaries not asserted in isolation (`editorTier` only seen via integration) | Medium |
| TEST-10 | Rate-limit / 3RR / autopatrol KV behavior only exercised incidentally, never directly | Low |

---

## TEST-1 — `verifyPow` (the only abuse gate) has no test

**Severity:** High

**Evidence:** `worker/src/moderation.ts:66` `export async function verifyPow(env, token)`. It enforces
freshness windows (`POW_WINDOW_MS = 120_000`, `POW_SKEW_MS = 60_000`, lines 46–47), leading-zero-bit difficulty
(`leadingZeroBits`, line 54), and single-use replay via KV (lines 90–97). No test file imports or calls
`verifyPow`, `powBits`, or `leadingZeroBits`. The integration tests pass `pow: "test"` to a worker run with
`POW_BITS` unset — but `powBits` defaults to **18** (`moderation.ts:51`), so those requests would *fail* PoW
unless the tests disable it; they pass because the integration harness sets `POW_BITS=0` (the disabled path,
`moderation.ts:68 if (bits <= 0) return`). So the **entire enforced path is never executed by any test.**

**Why it matters:** This is the single replacement for Turnstile — the only thing standing between a script and
unlimited anonymous PRs (SPEC M3). A regression in `leadingZeroBits` (off-by-one in `Math.clz32(byte) - 24`),
the skew/expiry math, or the replay-guard KV key (`pow:${tsStr}.${salt}`) would silently disable bot protection
while every test stays green. The client solver (`src/lib/pow.ts:34 solvePow`) and the server verifier share a
hand-rolled `leadingZeroBits` copy that must agree bit-for-bit; nothing asserts they do.

**Fix:** Add `worker/src/moderation.test.ts` (pure, no network):
- `leadingZeroBits` on crafted byte arrays (0x00…, 0x01, 0x80, all-zero).
- `verifyPow` accepts a token whose hash meets `bits` (solve a low-bit one in-test), rejects: missing token,
  expired (`ts` too old), future-skewed `ts`, insufficient bits, and **replay** (second call with the same token
  under a fake KV throws "already used").
- A cross-check test that `src/lib/pow.ts solvePow(n)` output passes `verifyPow` at `POW_BITS=n` — proves
  client/server agree. Use a small `bits` (e.g. 8) to keep it fast.

---

## TEST-2 — SSRF guard verified only for `127.0.0.1`; documented bypass classes unchecked

**Severity:** High

**Evidence:** `worker/src/handlers/cite.ts:62 assertFetchableUrl`. The blocklist is a regex on the literal
hostname string (`cite.ts:72-76`):
```
/^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|\[::1\])/ ... /^172\.(1[6-9]|2\d|3[01])\./ ...
host.endsWith(".internal") || host.endsWith(".local")
```
The only SSRF test is `cite.integration.test.ts:85` `rejects private addresses` — a single `http://127.0.0.1/secret`.

**Why it matters:** The Worker fetches **arbitrary user-supplied URLs** (`cite.ts:52 fetch(query.value, {redirect:"follow"})`).
The string-regex guard has real, well-known holes that no test pins down:
- **Decimal/octal/hex IP encodings**: `http://2130706433/` (=127.0.0.1), `http://0x7f.1/`, `http://017700000001/` —
  none match `^127\.`.
- **IPv6 forms** beyond `::1`: `[0:0:0:0:0:ffff:127.0.0.1]`, `[::ffff:169.254.169.254]` (cloud metadata) — not matched.
- **`redirect: "follow"`** means a public host can 302 to `http://169.254.169.254/` *after* the guard ran (the
  guard checks only the initial URL). This is the highest-risk gap and there's no test asserting redirect targets
  are re-validated (they currently aren't).

Because `/cite` is reachable behind the same PoW/rate gate as edits, this is a live SSRF surface (cloud metadata,
internal services). Pre-release, this is the kind of *real defect* the audit should weight highly.

**Fix:** Add `worker/src/handlers/cite.test.ts` asserting `assertFetchableUrl` rejects decimal/hex/octal IPs and
the metadata IP in IPv6-mapped form; add a test that a redirect to a private address is refused (requires
hardening the handler to re-check each hop or set `redirect:"manual"` and validate `Location`). Treat the failing
tests as the spec for the fix.

---

## TEST-3 — OAuth sign-in flow (`auth.ts`) is untested end of round-trip

**Severity:** High

**Evidence:** `worker/src/identity/auth.ts` contains `authLogin` (line 120), `authCallback` (line 135),
`signState`/`verifyState` (69/80), `isAllowedReturn` open-redirect guard (110), and `authStatus` (99).
`index.test.ts:74` tests `signSession`/`verifySession` (the JWT primitive) and `identity/writer.test.ts` tests
the session→author mapping — but **no test exercises `authLogin`/`authCallback`/`verifyState`/`isAllowedReturn`.**
Both GitHub and Wikigit providers (`identity/providers.ts`, 130 lines, `exchange`/`authorizeUrl`) are untested.

**Why it matters:** This is the entire "Sign in with GitHub / Wikigit" path (SPEC M2, M10). Two security-critical
guards live here and neither is asserted:
- **Open-redirect protection** (`isAllowedReturn`, `auth.ts:110`) — a regression makes `?return=https://evil/`
  succeed and leak the session JWT (which is dropped into `dest.hash = wikitoken=${jwt}`, `auth.ts:155`).
- **CSRF state** (`verifyState`, `auth.ts:80`) — the 10-minute window and HMAC are the only anti-forgery for the
  callback; an error here breaks the OAuth security model silently.

A signed-in user mis-mapping (provider confusion in `verifyState`'s `p === "wikigit" ? ... : "github"`, line 91)
would route a Wikigit login through GitHub exchange. None of this is covered.

**Fix:** Add `worker/src/identity/auth.test.ts`: `signState`→`verifyState` round-trip + rejection of tampered/expired
state; `isAllowedReturn` accepts a configured origin and the `*.wikigit.org` wildcard, rejects a foreign origin and
a non-URL; `authLogin` 503s when unconfigured and 400s on a bad `return`; `authCallback` (with a stubbed
`provider.exchange`) issues a redirect whose hash carries a verifiable session and 400s on bad state. Provider
`exchange` can be tested with a stubbed token/userinfo `fetch`.

---

## TEST-4 — Discussion threading (reply-to tree rebuild) untested

**Severity:** High

**Evidence:** Threading is the headline Talk feature (SPEC M4: "arbitrary-depth replies via a
`<!-- reply-to:<id> -->` marker rebuilt into a tree client-side"). Worker side: `worker/src/handlers/comments.ts`
parses `REPLY_MARKER` (line 60), `ANON_MARKER`/`GH_MARKER` (56/59), and builds threads in `getThread`/`listTopics`
(195/164). Client side: `src/lib/thread-store.ts` and `src/lib/comments.ts` reconstruct the tree. **None of
these have a test file** (`comments.ts`, `thread-store.ts` confirmed absent from the `src/lib` test list;
`comments.ts` worker handler appears in tests only via `index.test.ts`'s `authorOf`/`pickCategory` *unit* checks,
`index.test.ts:103,127` — not the threading/tree logic). `createTopic`/`postComment`/`getThread` have no
integration test.

**Why it matters:** GitHub Discussions natively nests only one level (SPEC I), so the entire arbitrary-depth tree
is *our* code. A bug in marker parsing (e.g. the `gh:` avatar capture `([^\s>]*)` swallowing a following marker)
or in the parent-linking would corrupt every Talk thread — orphaned replies, wrong attribution, broken reply
counts — with no test catching it. This is a primary user-facing surface and a core differentiator.

**Fix:** Unit-test the tree rebuild directly: feed `thread-store`/`comments` a flat list of comment bodies with
mixed `anon:`/`gh:`/`reply-to:` markers and assert the resulting tree (depth, parent links, attribution, counts).
Add a worker integration test for `createTopic`→`postComment(replyTo)`→`getThread` (GitHub GraphQL stubbed)
asserting the marker is written and a nested reply reads back under its parent.

---

## TEST-5 — Zero end-to-end / browser tests: no real user journey is verified

**Severity:** High

**Evidence:** No Playwright (confirmed `NO playwright dep`, no config, no `e2e/`). Every test is vitest unit or
worker-fetch integration. The Solid islands that wire the journeys together — `Editor.tsx` (PoW solve → diff
preview → streaming publish → progress bar), `AuthButton.tsx` (the heavily-reworked no-blink sign-in chrome,
R4/W8), `Discussion.tsx`, `Admin.tsx` — are never instantiated in any test.

**Why it matters:** The two flagship journeys are *only* verified piecewise:
1. **Anon edit → PoW → PR → auto-merge → live** — the worker half is integration-tested (`publish.integration`)
   and the client `submitEdit` stream is tested (`api.test.ts:22`), but **nothing connects them**: that the
   editor actually solves PoW, sends the token the worker expects, renders the NDJSON progress, and shows the
   merged result. The audit-relevant detail is that W4/W8/R3/R4 in FEATURES.md are *all* "fixed" hydration/blink
   bugs in exactly these islands — the class of bug that unit tests structurally cannot catch and that a single
   smoke test would.
2. **Sign-in (GitHub + Wikigit)** — `AuthBoot.astro` pre-paint + `AuthButton` hydration is described (W8) as
   having broken twice on the signed-in→avatar transition; no automated check guards against a third regression.

**Fix:** Add a *small* Playwright smoke suite (5–8 specs), run in `verify` against `astro preview` + a stubbed/dev
Worker:
- anon: open a page → Edit → type → Publish → progress bar completes → content updated (mock the Worker's NDJSON).
- redlink → `/new` → create → editor seeded.
- sign-in button renders at first paint signed-out (no blink), and with a seeded session the avatar shows at first
  paint (the W8 regression).
- Talk: post a topic, reply, see it nested.
- admin: load `/admin` as maintainer vs anon (gated UI hidden).
This is the single highest-leverage addition given how many shipped bugs were hydration/island bugs.

---

## TEST-6 — Full-text `search()` ranking and highlighting untested

**Severity:** Medium

**Evidence:** `src/lib/search.ts:43 export function search(docs, query, limit)` (AND-ranked, snippets per
FEATURES A) plus `toPlainText` (line 29) and `splitHighlight` (line 87). No `search.test.ts`.

**Why it matters:** Search is a primary read-path affordance (header search box, keyboard nav). The ranking
(AND of terms), snippet extraction, and highlight-splitting are pure, deterministic, easily-broken string logic
(tokenization, case-folding, term-boundary highlighting) — exactly what unit tests are best at, and currently
zero. A regression degrades discovery sitewide with no signal.

**Fix:** `src/lib/search.test.ts`: AND-matching (all terms must hit), ranking order (title hit > body hit),
`limit` respected, `toPlainText` strips markdown/markers, `splitHighlight` segments a match correctly including
overlapping/adjacent terms and no-match.

---

## TEST-7 — No Solid component tests for logic-bearing islands

**Severity:** Medium

**Evidence:** `src/components/**` has 50+ components and **no `*.test.tsx`**. The ones carrying real logic (not
just markup): `Editor.tsx` (draft restore, diff-before-submit, section splice-back, streaming), `FocusedEditor.tsx`
(section reconstruct, T6), `DiffView.tsx` (collapse/expand context, split/unified), `History.tsx` (compare-any-two
radios), `PageCuration.tsx` (optimistic patrol/tag/rollback), `LangBar.tsx` (existing vs add vs translate
classification, W5/W9), `AuthButton.tsx` (provider modal + hydration).

**Why it matters:** Much of this logic is *already* extracted into tested pure libs (`editor-section`, `diff`,
`lifecycle`, `languages`) — good. But the wiring (optimistic update rollback on error, draft clear-on-submit,
the focused-editor splice round-trip through `submitEdit`) lives in the component and is unverified. `@solidjs/testing-library`
+ vitest (jsdom) would cover the highest-value cases cheaply without Playwright.

**Fix:** Add component tests for `DiffView` (collapsed-context expand toggles), `LangBar` (given a config +
graph, asserts which languages land in switch/add/translate buckets — pure enough to test the helper directly if
extracted), and `PageCuration` (optimistic state reverts on a rejected endpoint). Prefer extracting any remaining
inline logic into a pure helper and unit-testing that over heavy DOM tests.

---

## TEST-8 — `linkgraph.ts` (client special-pages keystone) untested

**Severity:** Medium

**Evidence:** `src/lib/linkgraph.ts` (166 lines) inverts `[[links]]`+tags to drive orphaned/wanted/dead-end/
double+broken-redirect special pages and categories (FEATURES P, the "keystone"). No `linkgraph.test.ts`. The
worker twin `worker/src/indexlib.ts` *is* tested (`indexlib.test.ts`: `buildNode`, `extractLinks`, `computeGraph`).

**Why it matters:** SPEC M7 says the app "prefers the Worker and falls back to the static `*.json`" computed by
this client lib. If the two implementations drift, the static fallback (used on pure GitHub Pages, no Worker)
silently produces different special-pages results than the Worker path. The fallback is the *baseline* product
and is the untested one.

**Fix:** `src/lib/linkgraph.test.ts` mirroring `indexlib.test.ts`'s cases over a small page set, asserting
orphaned/wanted/dead-end/redirect detection and the `categories` inversion — ideally sharing fixtures with the
worker test so drift surfaces as a diff.

---

## TEST-9 — Trust-tier transition boundaries not asserted in isolation

**Severity:** Medium

**Evidence:** `worker/src/trust.ts` `editorTier` (the autoconfirmed/extended/maintainer ladder, SPEC L:
`AUTOCONFIRM_EDITS`=10/`AUTOCONFIRM_DAYS`=4, `EXTENDED_EDITS`=500/`EXTENDED_DAYS`=30). `trust` is imported by many
integration tests but there's no `trust.test.ts` asserting the *boundary* cases directly (only `TIER_RANK`/`asTier`
appear via `index.test.ts pageTier`).

**Why it matters:** Tier decides *whether an anonymous edit goes live without review* — the central safety lever
of autonomous mode (SPEC M5). Off-by-one on the edit-count or day thresholds either lets vandals auto-merge early
or never promotes legitimate editors. Integration tests fix specific scenarios but don't pin the exact boundaries
(9 vs 10 edits, 3 vs 4 days, `trusted-editors.json` → maintainer override, the owner-always-maintainer rule).

**Fix:** `worker/src/trust.test.ts` with synthetic commit histories: just-below vs just-at each threshold for
`auto` and `extended`, the days *and* count both required (10 edits in 1 day → still `open`), `trusted-editors.json`
membership → `maintainer`, and `REPO_OWNER` always maintainer.

---

## TEST-10 — Rate-limit / 3RR / autopatrol KV logic only exercised incidentally

**Severity:** Low

**Evidence:** `enforceRateLimit` (`moderation.ts:102`, 5/600s), `bumpEditWar` (3RR, `moderation.ts:29`), and
`autopatrol` (`moderation.ts:15`) have no direct test; they run only as side effects inside publish/edit
integration tests, which assert the *outcome* not the *counter*. `editwar.test.ts` exists but tests the risk/tag
decision, not the KV counter increment/expiry.

**Why it matters:** Low because the integration tests would catch a gross break (a 429 never firing). But the
window math (`expirationTtl`), the off-by-one at the limit (`count >= RATE_LIMIT_MAX` vs `>`), and the autopatrol
tier gate are untested boundaries. Cheap to cover; not urgent pre-release.

**Fix:** Fold into `moderation.test.ts` (TEST-1): with a fake KV, assert the Nth edit is allowed and the N+1th
throws 429, `bumpEditWar` flips `true` past `THREE_RR_MAX`, and `autopatrol` writes `patrol:<sha>` only at/above
the tier.

---

## Highest-value additions, ranked

1. **`worker/src/moderation.test.ts`** (TEST-1, TEST-10) — covers the bot gate + rate/3RR; ~1 file, pure, fast.
2. **A small Playwright smoke suite** (TEST-5) — the only thing that catches the hydration/island bug class that
   has repeatedly shipped (R3/R4/W4/W8). Wire into `verify`.
3. **`cite.test.ts` SSRF hardening tests** (TEST-2) — these double as the spec for closing a live SSRF hole.
4. **`identity/auth.test.ts`** (TEST-3) — guards open-redirect + OAuth CSRF state.
5. **Discussion threading tests** (TEST-4) — the core Talk differentiator, currently uncovered client and server.

**Verdict on a Playwright suite:** Yes — a *small* one (5–8 smoke specs) is warranted specifically because the
project's own FEATURES backlog shows the dominant shipped-bug class is SSR/hydration/blink in the islands, which
unit and worker-fetch tests cannot reach. Keep it thin and deterministic (stub the Worker) so it stays fast in
`verify`.
