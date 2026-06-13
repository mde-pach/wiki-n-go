# 07 — Spec & Feature Gaps / Inconsistencies

Audit dimension: reconcile `SPEC.md` + `FEATURES.md` against the actual code in
`src/` and `worker/src/`. Findings weighted toward **real defects and stale docs**,
not production-hardening theater (per the pre-release memory).

Method: read both tracker docs end-to-end, then grepped/opened the code paths each
open or partial item points at. Every finding cites `file:line`.

## Summary

| ID | Title | Severity |
|---|---|---|
| GAP-1 | `protection:` / ban `expires` documented as TODO and genuinely missing — temp protection/blocks impossible | High |
| GAP-2 | FEATURES §M "RecentChanges feed" marked ⬜ P0 but is fully shipped (stale status) | High |
| GAP-3 | Minor-edit flag claimed 🟡 in §K but has **zero** implementation | High |
| GAP-4 | Watchlist / notifications / email / "Thanks" — entirely unbuilt, blocked on M10 Hub which isn't started | High |
| GAP-5 | M10 Hub + "wire dogfood/main instance" never started; Accounts persistent-volume follow-up actually DONE but SPEC says open | Medium |
| GAP-6 | CODEOWNERS / GitHub-team sync repeated as TODO in 4 places, no code at all | Medium |
| GAP-7 | Trailing-run rollback unimplemented; `/rollback` is per-commit only (contradicts FEATURES §K "trailing run") | Medium |
| GAP-8 | Suppression marked 🟡 with hard-purge a "manual op" — no dedicated private suppression log either | Medium |
| GAP-9 | Salt/epoch rotation (M5 last box, privacy invariant) deferred; no scaffolding, blocks the stated linkability cap | Medium |
| GAP-10 | Spam/title/link blacklist (§M P0/P1) deleted with filters and never replaced — "spam handled elsewhere" is vapor | Medium |
| GAP-11 | Search ranking is title-only AND-match; no body/recency weighting — undocumented quality gap | Low |
| GAP-12 | Stale doc/comment drift: `DEFAULT_EDIT_TIER` "protection.json" comment, README repo name, M5 critical-path #2 still unchecked | Low |
| GAP-13 | Ban authority/reason (§N) shipped in code but row marked ⬜; FEATURES undercounts it | Low |
| GAP-14 | `wg:` handle namespace/uniqueness unresolved (open in SPEC + `TODO(handle)` in code) — soft-blocks profiles for wg users | Low |

---

## GAP-1 — `expires` for protection and bans is missing (temp protection/blocks impossible)

**Severity: High**

Evidence:
- SPEC M5: `worker/src/protection.ts` line 332 — "Replaced `protection.json`+globs. **TODO: `expires`, CODEOWNERS.**"
- SPEC M6: line 372 — "**TODO: ban `expires`.**"; line 376 — "TODO: ... protection `expires`".
- FEATURES §L line 210: protection "`expires` / CODEOWNERS / **full** = branch protection still TODO".
- Code confirms absence: `grep -niE "expires|until" worker/src/protection.ts worker/src/handlers/protect.ts` → **no matches**. `grep "expires" worker/src/bans.ts worker/src/handlers/bans.ts` → **no matches**. The ban schema (`worker/src/bans.ts:7-17`) carries `key, paths, reason, by, at` — **no `expires` field**.

Why it matters: Wikipedia's protection and blocking are overwhelmingly *temporary* (24h semi-protection, 31h vandalism blocks). Without `expires`, every protection and every ban is **indefinite**, so a maintainer who semi-protects a page during an edit war must remember to manually unprotect it, and a short block is impossible. This is the single most-repeated TODO in the tracker (4 occurrences) and is a real feature gap, not polish.

Fix: add an optional `expires` (ISO timestamp) to `NormalBan` (`worker/src/bans.ts`) and to the `protection:` frontmatter parse in `worker/src/protection.ts`; treat an expired entry as absent in `banApplies` / the protection tier read (lazy expiry at read time — no cron needed, consistent with the git-as-store model). Surface a duration picker in the `/admin` Blocks and Protection tabs.

---

## GAP-2 — FEATURES §M "RecentChanges feed" marked ⬜ P0 but it is fully shipped

**Severity: High** (it's the highest-priority row in Part II and reads as unbuilt to anyone planning work)

Evidence:
- FEATURES §M line 217: "**RecentChanges** feed (+ New-Filters...) | feed over `git log`/merged PRs ... | **⬜** | **P0**".
- Also §M critical-path item 5 (line 291) lists it as still-to-do; the "autonomous mode critical path" header frames items 2-6 as the remaining set.
- But the feature exists end-to-end: `worker/src/index.ts:88` — `"GET /changes": () => listChanges(...)`; `worker/src/handlers/moderation.ts:37` — "RecentChanges + the curation toolbar"; `src/lib/changes.ts:26` consumes `/changes`; the `/admin` console and `/changes` filters (anon/risk/author) are all built (M5/M6 marked ✅, which depend on this feed).

Why it matters: a P0 row showing ⬜ on the project's own tracker tells a future contributor (or the owner) that the keystone post-hoc-moderation surface is missing, when it's the spine of M5/M6. This is the most misleading single status in the docs.

Fix: flip §M RecentChanges row to ✅ (with the filter vocabulary actually shipped), and update the §M critical-path checklist (lines 287-292) to mark items 1, 3, 5, 6 done and call out only what's genuinely left (item 2 protection.json→frontmatter already shipped too; item 4 AbuseFilter was *removed*, see GAP-10).

---

## GAP-3 — Minor-edit flag claimed partial (🟡) in §K but has zero implementation

**Severity: High** (a documented P1 capability that simply does not exist)

Evidence:
- FEATURES §K line 199: "Edit summary · minor-edit flag | commit message / PR title; `Minor:` trailer or label | **🟡** | P1".
- Code: `grep -rniE "minor.?edit|isMinor|Minor:"` across `src/` and `worker/` → **no matches**. There is no minor checkbox in `src/components/Editor.tsx`, no `Minor:` trailer written anywhere, no label applied, and no filter for it in `/changes`.

Why it matters: 🟡 ("partial") implies the summary half is done and only the minor flag remains — but inspection shows **nothing** of the minor-edit concept is wired (the edit summary is a separate, real field; the minor flag is conflated into the same row and inherits its green). A patroller filtering RecentChanges by "hide minor edits" (a core Wikipedia patrol workflow) has no such control. The status overstates progress.

Fix: either downgrade the minor-flag half to ⬜ and split it from the summary row, or implement it: a checkbox in `Editor.tsx` → a `Minor:` commit trailer → a `minor` tag in the change feed → a hide-minor filter in `/changes` and `/admin`.

---

## GAP-4 — Watchlist / notifications / email / Thanks are entirely unbuilt and block on an unstarted Hub

**Severity: High** (the biggest cluster of "Wikipedia user expects this" gaps; correctly tracked as ⬜ but the dependency chain is broken)

Evidence:
- FEATURES §Q line 279: "Watchlist + Echo notifications ... | **account-path only** ... | **⬜** | P2".
- §Q line 280: Thanks/reactions/barnstars ⬜; §Q line 281: pageview analytics ⬜; §U U2 (line 341): talk reactions ⬜.
- Code: `grep -rniE "watchlist|notification|subscribe"` across `src/` and `worker/` → **no matches**. No email send path exists in the Engine (email lives only in `accounts/src/email.ts` for sign-in codes).
- These all depend on a "durable, reachable identity" = the `wg:` Wikigit account + Hub. But **M10 Hub is ⬜** (SPEC line 589) and "wire dogfood + main instance" is ⬜ (line 591), so the prerequisite is itself not started (see GAP-5).

Why it matters: watchlist + "you were reverted / replied to / thanked" notifications are arguably the #1 retention feature of a Wikipedia-style wiki and the reason editors come back. Today there is **no inbox of any kind** — an editor whose work is auto-reverted (GAP via automod) learns of it only by chance. It's correctly P2 and gated on identity, but the doc presents the gate (M10) as closer than it is.

Fix: no code change demanded by this audit, but record the real dependency edge in SPEC: watchlist/notifications/Thanks → M10 Hub + Accounts wiring (GAP-5) → and decide a minimal anon-friendly fallback (e.g. an opt-in "watch this page" that posts to a Discussion thread, since anon has no inbox by design). At minimum, flag in §Q that these are **blocked, not merely deferred**.

---

## GAP-5 — M10 Hub + dogfood wiring never started; the "Accounts persistent volume" follow-up is actually DONE

**Severity: Medium** (two-way drift: one item not started, one item finished-but-still-listed-open)

Evidence — not started:
- SPEC M10 line 589: "⬜ **Hub — tenant console** ... auth via Accounts." `ls hub/` → **no directory**.
- SPEC M10 line 591: "⬜ **Wire dogfood + main instance** to the canonical IdP; expose the self-host `issuer` override in config." The Engine has `WIKIGIT_ISSUER`/`WIKIGIT_CLIENT_ID` env (`worker/src/types.ts:43-44`) but no default config points at the canonical issuer, so the "Sign in with Wikigit" path is inert in every shipped deploy.

Evidence — done but still marked open:
- SPEC M10 line 587-588 (Accounts bullet) ends: "**Follow-up:** mount a persistent `/data` volume + `STORE_PATH` so OpenAuth's signing/encryption keys survive restarts (**today they regenerate per boot**, invalidating in-flight sign-ins)." Same caveat in Decision Log 2026-06-08 (line 695) and Open list (line 594).
- Code contradicts: `accounts/src/index.ts:13-15` — `MemoryStorage({ persist: process.env.STORE_PATH ?? "/data/auth-store.json" })`; `accounts/Dockerfile:13-14` — `ENV STORE_PATH=/data/auth-store.json` + `VOLUME ["/data"]`. The persistence the follow-up asks for **is implemented**; keys no longer regenerate per boot.

Why it matters: the Hub gap blocks the entire account-path feature set (GAP-4). The stale Accounts follow-up makes the auth layer look more fragile than it is and could send someone to "fix" an already-fixed problem.

Fix: update SPEC M10 — strike the Accounts persistent-volume follow-up (it's done; cite `accounts/Dockerfile`), and keep Hub + dogfood-wiring as the genuine remaining M10 work. Add the `issuer` config default as a tracked sub-item.

---

## GAP-6 — CODEOWNERS / GitHub-team sync: repeated TODO across 4 doc locations, no code

**Severity: Medium**

Evidence:
- Doc TODOs: SPEC line 332 (protection), line 376 (rights), FEATURES §L line 209 ("GitHub-team sync still TODO"), §L line 210 ("CODEOWNERS ... still TODO"), §N line 235 ("GitHub-team + CODEOWNERS sync still TODO"), §N line 236 (interface-admin = "CODEOWNERS-gate Worker/front-end" ⬜ P1).
- Code: `grep -rni "codeowners" worker src` → **no matches**. Rights live purely in `trusted-editors.json` (per Decision Log 2026-06-06, line 662), with no GitHub-team or CODEOWNERS bridge.

Why it matters: §N's "interface-admin" concern is legitimate — editing the Worker/front-end/config is strictly more dangerous than editing content, yet today a `trusted-editors.json` maintainer is gated the same for both. Without CODEOWNERS, there's no higher bar on code/config paths. This is a P1 governance gap that's been deferred consistently but never scoped into a milestone with an owner.

Fix: decide whether CODEOWNERS sync is in-scope pre-release at all (it adds a GitHub-team token scope the single-Worker model has avoided). If yes, scope it as its own M6 follow-up. If no, mark it explicitly **post-v1** in SPEC instead of leaving it as a perpetual inline "TODO" that implies imminence.

---

## GAP-7 — Trailing-run rollback unimplemented; `/rollback` is per-commit only

**Severity: Medium**

Evidence:
- SPEC M6 line 366: "TODO: trailing-run rollback." FEATURES §K line 201: "maintainer-gated Worker `POST /rollback` restores each page a commit touched ... (per-commit; **trailing-run TODO**) | 🟡".
- Code: `worker/src/revert.ts` + `worker/src/handlers/moderation.ts` implement `revertCommit` over a single sha; `grep -niE "trailing|run"` in those files → no trailing-run logic. The automod path (`worker/src/automod.ts`) also reverts a single commit.

Why it matters: Wikipedia "rollback" undoes a contributor's **entire trailing run** of consecutive edits to a page in one click — the core anti-vandalism affordance. Per-commit revert means a maintainer reverting a vandal who made 5 consecutive edits must revert 5 times (or restore-to-revision, which is the actual workaround but isn't what the row claims). The 🟡 is honest, but the gap is squarely in the moderation hot path.

Fix: add a "rollback to before this author's run" mode to `revertCommit` — walk back consecutive commits by the same author on that page and restore to the state before the run, as one reversible commit. Reuses the existing primitive; no new write path.

---

## GAP-8 — Suppression is 🟡: hard-purge is manual and there's no dedicated suppression log

**Severity: Medium**

Evidence:
- SPEC M6 line 377-380: "🟡 **Oversight/suppression** ... Full **hard-purge** (git history rewrite + CDN purge) stays a **manual owner op** — the Worker can't rewrite history via the contents API."
- FEATURES §N line 242: "a dedicated private suppression log still TODO."
- Code: `worker/src/suppression.ts:7` — "Full hard-purge — rewriting git history — stays a manual owner op." Redaction at read time works (`/changes`+`/history` label → `[suppressed]`); `grep "purge"` confirms no automated purge path.

Why it matters: suppression's whole point is removing content **even from admins and from the source**. Today suppressed text is only *relabeled* in the API responses — the raw author/revision still sits in git history and on the CDN (jsDelivr@sha), reachable by anyone who knows the sha. For genuine PII/defamation removal this is insufficient, and the gap between "looks suppressed in the UI" and "still public in git" is a footgun. Also, audit entries for suppress/unsuppress go into the shared public `audit-log.jsonl`, defeating the privacy goal of suppression (a private log is the §N TODO).

Fix: keep hard-purge manual (the contents-API limit is real) but (a) document the exact manual purge runbook in SPEC so it's actionable, and (b) split suppress/unsuppress audit entries out of the public `audit-log.jsonl` into a maintainer-only log (or omit the suppressed value from the public entry). Until purge exists, the UI should not imply content is gone.

---

## GAP-9 — `ip_hash` salt/epoch rotation deferred with no scaffolding; it's a stated privacy invariant

**Severity: Medium**

Evidence:
- SPEC M5 last box (line 348): "⬜ (Optional hardening) `ip_hash` salt/epoch rotation to cap long-term linkability — deferred, not a blocker." Also §6 line 217, FEATURES Part II privacy invariant (line 190-191): "A fixed salt makes `anon-<hash>` permanently linkable ... **evaluate periodic salt/epoch rotation**."
- Code: `worker/src/identity/index.ts:72` does repo-salting (`HMAC(secret, repo + ip)`) for multi-tenant isolation, but there is **no time-epoch component** — the salt is static, so `anon-<hash>` is permanently linkable per repo, exactly the thing the invariant flags. `grep -niE "epoch|rotat"` → no rotation logic.

Why it matters: the docs assert the privacy model is *stronger* than Wikipedia's Temporary Accounts (which rotate names ~90 days). But without epoch rotation it's actually **weaker on long-horizon linkability** — a fixed salt makes an anon pseudonym a permanent fingerprint. This is the one place the privacy claim outruns the implementation.

Fix: add an epoch to the HMAC input (`floor(now / EPOCH_DAYS)`), env-tunable, defaulting off to preserve trust-tier continuity (rotation resets earned trust for anon — that tradeoff must be decided, and is itself an undocumented sub-decision). At minimum, soften the SPEC claim until rotation exists.

---

## GAP-10 — Spam/title/link blacklist (P0/P1) was deleted with the AbuseFilter and never replaced

**Severity: Medium**

Evidence:
- Decision Log 2026-06-08 (SPEC line 706): "Removed the pre-publish content/spam filter ... **No replacement gate added in the Worker — by design, spam control will live elsewhere.**" M5 line 335 same.
- FEATURES §M line 221: AbuseFilter "built, then removed (2026-06-08); spam handling moves **elsewhere**" — ⬜ **P0**. §M line 222: "Spam/title/link blacklists | versioned blocklist files the Worker checks | ⬜ | P1".
- Code: `ls worker/src/filters*` → no matches; `grep "blocklist|blacklist"` → only a UI tag preset (`PageCuration.tsx:28`), no Worker-side domain/title blocklist.

Why it matters: "spam handled elsewhere" names no actual mechanism. The autonomous mode *auto-merges* trusted-tier edits with no content gate — so a determined spammer who clears the modest auto-confirm threshold (10 edits / 4 days, IP-rotatable per the docs' own warning at §L line 212) can publish spam links live with **nothing** checking the diff. The removal was deliberate, but the P0 row left dangling with no successor is a genuine hole in the moderation story.

Fix: decide and document *where* spam control lives. A minimal versioned `spam-domains.txt` checked in `prepareEdit` (the same gate point the filter occupied) is the cheapest replacement and fits the single-Worker model. If the answer is truly "post-hoc only via revert-risk + automod," say so explicitly and drop the §M blacklist rows to ⊘/post-v1 rather than ⬜ P0/P1.

---

## GAP-11 — Search ranking is title-only AND-match; no body or recency weighting

**Severity: Low** (works, but quality gap a wiki user notices; undocumented as a known limitation)

Evidence:
- `src/lib/search.ts:41-70`: every term must appear (AND); scoring is title-substring weighted (`inTitle ? 10 : 3`, prefix `+8`, exact `+20`) with `localeCompare` tiebreak. No term-frequency, no body weighting beyond a flat +3, no recency/popularity signal.
- FEATURES §A line 18 marks full-text search ✅ "AND-ranked, snippets" — accurate that it ships, but the ranking quality is presented without caveat.

Why it matters: for a knowledge base, body-relevance and recency matter; a flat +3 for any body hit means a stub that mentions a term once ranks identically to the authoritative article on it. Not a defect, but a quality ceiling that isn't tracked anywhere as a known limitation or future improvement.

Fix: add a FEATURES note that search ranking is title-weighted v1; consider TF on the body and a small recency boost (commit date is already available via git). Low priority pre-release.

---

## GAP-12 — Stale comments and tracker text after migrations

**Severity: Low** (documentation hygiene)

Evidence:
- `worker/src/types.ts:23`: `DEFAULT_EDIT_TIER` comment — "tier required to edit a path with no **protection.json** rule" — but protection.json was replaced by frontmatter (Decision Log 2026-06-05, line 650). Stale comment referencing a removed mechanism.
- SPEC M5 critical-path #2 (line 288): "**`protection.json` per-path tiers** + CODEOWNERS (§L) — make review *selective*." — still phrased as `protection.json` and unchecked, though the frontmatter `protection:` field shipped (M5 line 332 ✅). The critical-path list (lines 287-292) is out of sync with the milestones above it.
- `README.md:25-27`: deploy buttons point at `mde-pach/wiki-n-go` — fine per the Wikigit-rename-scope memory (infra ids stay `wiki-n-go`), so **not** a bug, but worth a one-line note in README so a reader doesn't "fix" it (the memory exists precisely because this confuses).

Why it matters: low-severity but these are exactly the kind of stale references that mislead the next editor. The critical-path checklist contradicting the milestone bodies (GAP-2 also) is the worst of them.

Fix: update the `DEFAULT_EDIT_TIER` comment to "no `protection:` frontmatter"; reconcile the M5 critical-path checklist with the actual milestone statuses (items 1-3,5,6 done; 4 removed).

---

## GAP-13 — Ban authority/reason shipped in code but FEATURES row marked ⬜

**Severity: Low** (status undercounts a shipped capability)

Evidence:
- FEATURES §N line 239: "**Bans** (community vs ArbCom) ... | record *authority/reason* on `bans.json` entries ... | **⬜** | P2".
- Code: `worker/src/bans.ts:7-17,32-41` — `NormalBan` carries `reason`, `by`, `at`; `serializeBan` persists them; `bans.integration.test.ts:81-92` tests `reason: "spam"`. The authority/reason recording the row calls for is **implemented** (only the "lightweight Discussion-consensus to authorize" half is missing).

Why it matters: the ⬜ undersells what's built; someone could re-implement the already-present `reason`/`by` fields.

Fix: flip §N line 239 to 🟡 (reason/authority recorded; consensus-to-authorize flow still ⬜).

---

## GAP-14 — `wg:` handle namespace/uniqueness unresolved — soft-blocks profiles for Wikigit users

**Severity: Low** (correctly tracked; flagged here because it gates a P2 feature)

Evidence:
- SPEC M10 "Open" (line 593): "`wg:` handle namespace + uniqueness (the Engine keys `wg:` off the stable `sub` meanwhile)."
- Code: `accounts/src/index.ts:26-27` — `TODO(handle): derived from the local-part, so not yet unique — the Engine keys wg: off id.` `deriveHandle` (line 17-24) can collide (two `jane@x.com` / `jane@y.com` → both `jane`).

Why it matters: profiles (FEATURES U3 / §Q) for `wg:` users need a durable, unique handle for `/user/<handle>`. The Engine keys trust off `sub` (safe), but the *display handle* can collide, so the profile-URL story for Wikigit accounts isn't closed. Low severity because it's correctly tracked and the trust key is stable.

Fix: decide the handle uniqueness policy (suffix-on-collision, or claim-once) in Accounts before profiles open to `wg:` users; it's the last open M10 sub-decision.

---

## Prioritized backlog (gaps, ranked)

1. **GAP-1** add `expires` to bans + protection (temp blocks/protection — most-repeated TODO).
2. **GAP-2** fix the RecentChanges ⬜→✅ status + reconcile the §M critical-path (worst doc drift; misrepresents the keystone).
3. **GAP-3** implement or honestly downgrade the minor-edit flag (claimed 🟡, is 0%).
4. **GAP-10** decide where spam control actually lives — auto-merge has no content gate post-filter-removal.
5. **GAP-7** trailing-run rollback (core anti-vandal one-click).
6. **GAP-8** suppression: split the private log out of public audit; document the purge runbook.
7. **GAP-9** epoch-rotate `ip_hash` or soften the "stronger than Wikipedia" privacy claim.
8. **GAP-4 / GAP-5** unblock the account-path features by scoping M10 Hub + dogfood wiring; strike the done Accounts-volume follow-up.
9. **GAP-6** decide CODEOWNERS in/out of v1 instead of perpetual inline TODO.
10. **GAP-13 / GAP-12 / GAP-11 / GAP-14** doc-status corrections and low-priority quality items.

### Cross-cutting observation
The two tracker docs are unusually thorough, but the **§M autonomous-mode critical-path checklist (SPEC lines 287-292 / FEATURES) has drifted out of sync with the milestone bodies above it** — items it lists as pending (RecentChanges, protection-per-path, AbuseFilter) are respectively shipped, shipped, and deliberately removed. That single checklist is the source of the two highest-severity *status* gaps (GAP-2) and should be rewritten to match reality.
