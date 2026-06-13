# Worker Correctness & Bugs — Audit Report

Scope: `worker/src/**` excluding pure-security concerns. Focus on publish atomicity/idempotency, trust-tier derivation, lifecycle ops, automoderator/revert, index patching, 3RR/risk, KV consistency, `/cite`, `/latest`, and Workers floating-promise hygiene.

All findings verified by reading the cited code. This is a pre-release project, so production-hardening theater is de-weighted; the report leads with genuine logic defects.

## Summary

| ID | Title | Severity |
|----|-------|----------|
| WB-1 | Trust count for anonymous authors queries the wrong GitHub field (name vs email) | High |
| WB-2 | `/contributions` and `editorTier` populate the same `trust:` cache key from divergent queries | High |
| WB-3 | Concurrent same-author edits to one slug race on branch creation → 502 | High |
| WB-4 | Resubmit no-op path patches index but never busts `meta:index` for non-trivial drift; `updateIndexEntry` perpetually refreshes the safety-rebuild TTL | Medium |
| WB-5 | `openOrReusePr` re-PUTs file on every retry, creating an empty/duplicate commit when content already matches the branch tip | Medium |
| WB-6 | Streamed publish runs in `ReadableStream.start` with no `waitUntil`; client disconnect can abort a half-done publish | Medium |
| WB-7 | `revertRisk` adds +20 for *any* non-`edit-war` tag, so `auto-reverted`/maintenance tags retroactively inflate a change's risk score | Medium |
| WB-8 | `classify()` DOI regex is unanchored at the start → ordinary URLs ending in a DOI-like path are mis-detected as DOIs | Low |
| WB-9 | `repoJson` reads bans/trusted-editors via the un-authenticated raw CDN, which caches ~5 min → ban/trust changes lag and private repos return null | Low |
| WB-10 | Automod cap key never resets the page tier; `firstMs` defaults to `Date.now()` for zero-commit authors, making `days` ≈ 0 (correct) but the `n:0` cache is written with the full 1h TTL even on a transient API failure | Low |

---

## WB-1 — Trust count for anonymous authors queries the wrong GitHub field

**Severity:** High

**Evidence:**
- `worker/src/trust.ts:110-119` — `countAuthored` filters by the synthetic *email*:
  ```ts
  const base = `…/commits?author=${encodeURIComponent(email)}&sha=${env.BRANCH}&per_page=1`;
  ```
  For an anon writer the email is `anon-<hash>@anon.invalid` (`worker/src/identity/index.ts:24`).
- `worker/src/handlers/contributions.ts:44-51` — for the *same* anon identity, the contributions query filters by the *name*:
  ```ts
  const email = isAnon ? `${author}@anon.invalid` : author;       // computed…
  gh(…`/commits?author=${encodeURIComponent(author)}…`)           // …but the NAME is sent
  ```

GitHub's `?author=` qualifier matches a commit's author **email** or a registered GitHub **login** — it does **not** match the git author *name*. Anonymous commits are authored with name `anon-<hash>` and email `anon-<hash>@anon.invalid`, and `anon-<hash>` is not a GitHub login. So:

- `trust.ts` (email filter) can return the real count.
- `contributions.ts` (name filter) will return **zero** commits for the same anon author.

**Impact:** A profile/contributions page for an anonymous identity shows an empty history even when that pseudonym has many accepted edits, while the trust tier derived in `trust.ts` is non-zero — the two surfaces disagree. The `email` variable computed at `contributions.ts:44` is dead (only passed to `editorTier`, which re-derives via `trust.ts`), masking the bug.

**Fix:** Make both call sites filter by the same field. Since anon commits carry a real author email, query `?author=<email>` in `contributions.ts` (use the `email` it already computes) rather than `author`. Add a test that an anon author with N commits reports N in both `editorTier` and `/contributions`.

---

## WB-2 — `/contributions` and `editorTier` populate the same `trust:` cache key from divergent queries

**Severity:** High

**Evidence:**
- `worker/src/trust.ts:92-99` caches stats under `trust:${name}` and derives them from `countAuthored(env, email)` where for a signed-in user `email = ghNoreplyEmail(s.id, s.login)` = `<id>+<login>@users.noreply.github.com` (`worker/src/identity/index.ts:32`, `worker/src/identity/auth.ts:20-21`).
- `worker/src/handlers/contributions.ts:44-52` computes `email = author` (the **bare login**) for signed-in users and calls `editorTier(env, author, email)` — which flows into `trustStats(env, name, email)` → `countAuthored(env, email)` with the *bare login* as the `author` param.

So `trust:<login>` is written by whichever path runs first, from one of two different GitHub queries (`author=<id>+<login>@users.noreply.github.com` vs `author=<login>`). They *usually* resolve to the same account, but:
- the `firstMs` (earliest-commit timestamp) is read from the last page of whichever query ran, and page boundaries differ if the account ever committed under a different email outside the Worker;
- if a maintainer changed their commit email, the noreply form and login form can return different sets.

**Impact:** Non-deterministic trust stats depending on which endpoint warmed the 1h cache; a contributions view can silently lower/raise an editor's computed tier for the next hour. Two code paths derive "the same" identity's email differently — a latent correctness hazard whenever GitHub's email/login resolution diverges.

**Fix:** Centralize the `(name, email)` derivation for an author string in one helper shared by `editorTier` callers and `contributions`, so the cache key and the commit query are always computed the same way. Don't pass a bare login as `email`.

---

## WB-3 — Concurrent same-author edits to one slug race on branch creation → 502

**Severity:** High

**Evidence:** `worker/src/handlers/content.ts:432-450`:
```ts
const ref = await gh<…|undefined>(env, `/repos/${repo}/git/ref/heads/${branch}`, { allow404: true });
…
if (ref) { … } else {
  const base = await gh<…>(env, `/repos/${repo}/git/ref/heads/${env.BRANCH}`);
  await gh(env, `/repos/${repo}/git/refs`, {                    // ← no allow-conflict
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
  });
  …
}
```

The branch is deterministic per author+slug (`editBranch`, `content.ts:399-401`). Two requests from the same identity to the same slug (double-click, retry-on-slow, two tabs) both read `ref === undefined`, both attempt to `POST /git/refs`. The first succeeds; the second gets GitHub `422 Reference already exists`, which `gh()` (`worker/src/github.ts:39`) rethrows as `HttpError(502)`. Because this is inside the streamed publish, it surfaces as an in-band `{type:"error", status:502}` — an opaque failure for a perfectly retryable case the deterministic-branch design was meant to *reconcile*.

**Impact:** The headline idempotency guarantee ("a resubmit reconciles that branch/PR instead of stacking a duplicate", `content.ts:396-398`) breaks under concurrency: the second concurrent submit 502s instead of reusing the branch.

**Fix:** Treat a 422 on the ref-create as "branch already exists" and fall through to the update path (re-read the file sha on the branch and PUT). Either pass an `allow409/allow422` flag through `gh`, or catch the create error and retry as if `ref` had been found.

---

## WB-4 — No-op/index patching can outrun the safety rebuild; `updateIndexEntry` refreshes the rebuild TTL on every edit

**Severity:** Medium

**Evidence:**
- `worker/src/handlers/index-cache.ts:43-50` — `meta:index` is a `cached()` value with a 1h `INDEX_TTL_MS` "safety rebuild for drift (PR merges, direct pushes)".
- `worker/src/handlers/index-cache.ts:79-88` — `updateIndexEntry` re-writes the whole cache envelope with a fresh `ts`:
  ```ts
  await kvPutJson(env, "meta:index", { v: hit.v, ts: Date.now() });
  ```
  `cached()` (`worker/src/kv.ts:34-35`) decides freshness via `Date.now() - hit.ts < ttlMs`. Every direct edit/restore/auto-merge bumps `ts`, so on an actively-edited wiki the 1h safety rebuild **never triggers**.

**Impact:** Drift sources that the comment explicitly lists — out-of-band direct pushes to the repo, or any path that mutates content without calling `updateIndexEntry`/`invalidateContent` — are never reconciled as long as in-site edits keep arriving, because each in-site edit resets the rebuild clock. The link-graph/search index can stay stale indefinitely.

**Fix:** Preserve the original `ts` when patching in place (read it from the existing envelope and write it back unchanged), so the safety rebuild fires on schedule regardless of edit volume. Alternatively store the rebuild deadline separately from the last-patch time.

---

## WB-5 — `openOrReusePr` always re-PUTs the file, producing an empty/duplicate commit on retry

**Severity:** Medium

**Evidence:** `worker/src/handlers/content.ts:437-454`. After locating or creating the branch, the code unconditionally PUTs the content:
```ts
fileSha = (await getCurrentFile(env, repo, path, branch))?.sha;
…
await gh(env, `/repos/${repo}/contents/${path}`, { method: "PUT", body: editCommit(env, ctx, branch, fileSha) });
```
There is no check that the branch's current content already equals `ctx.content`. The top-level no-op guard (`content.ts:311`) only compares against the **live branch**, not the **author's edit branch**. So a resubmit whose content already matches the branch tip (e.g. the PR was opened, the user resubmits identical content) issues another `PUT` with the same content.

GitHub's contents PUT with identical content + the correct blob sha returns the existing commit without creating a new one *only if the tree is unchanged* — but because the committer/author and message can differ, and because the blob is re-encoded, this commonly produces a redundant commit on the branch, padding the PR and the author's commit count (which feeds trust, WB-1/WB-2).

**Impact:** Idempotency is partial: re-PUTs can inflate the branch history and, via merged commits, the trust counter; the PR diff grows noise.

**Fix:** Before the PUT, compare the branch file's `raw` to `ctx.content` and skip the write when equal (mirror the live-branch no-op check against the branch tip).

---

## WB-6 — Publish work runs inside `ReadableStream.start` with no `ctx.waitUntil`; a client disconnect can abort a half-finished publish

**Severity:** Medium

**Evidence:** `worker/src/http.ts:74-99` — `ndjsonStream` runs the entire publish (`run(...)`) inside `ReadableStream.start`, enqueuing progress. `worker/src/index.ts:101-112` wires `/edit` to it. The `fetch` handler signature (`index.ts:61`) takes only `(request, env)` — `ctx`/`ExecutionContext` is never threaded in, so there is no `waitUntil`.

When the HTTP client disconnects mid-stream, the Workers runtime cancels the `ReadableStream` and may tear down the request context. The publish sequence in `runPublish` (`content.ts:357-394`) — open PR → squash-merge → `finishPublish` (invalidate caches, patch index, autopatrol, tag, delete branch) → `autoModerate` — is multi-step and **not** atomic. An abort between merge and `finishPublish` leaves the page live but with a stale `meta:index`/`meta:latest-sha`, an undeleted branch, and no autopatrol/tag.

**Impact:** A flaky client or a user navigating away can leave the index and cache pointers inconsistent with the merged content until the next invalidation, and orphan edit branches accumulate.

**Fix:** Thread `ExecutionContext` into the handler and wrap the streamed publish in `ctx.waitUntil(...)` so the runtime keeps the work alive past client disconnect; or perform the merge+bookkeeping eagerly and only stream progress markers around an already-committed promise.

---

## WB-7 — `revertRisk` adds +20 for any non-`edit-war` tag, so post-hoc tags inflate the displayed risk

**Severity:** Medium

**Evidence:** `worker/src/risk.ts:26-27`:
```ts
if (i.tags.includes("edit-war")) score += 25;
if (i.tags.some((t) => t !== "edit-war")) score += 20;
```
The second line fires for *any* tag that isn't `edit-war` — including `auto-reverted` (added by the automoderator, `content.ts:552`) and arbitrary maintenance tags a maintainer attaches via `/tag` (`handlers/moderation.ts:39-60`). In `listChanges` (`content.ts:133-139`) the stored tag set is passed straight into `revertRisk`, so a change that was already reverted, or merely labelled, shows a permanently +20 risk.

**Impact:** Already-handled or benignly-labelled changes display inflated risk in RecentChanges, undermining the score's purpose (surfacing *un*-reviewed risk). For automod, the scoring at `content.ts:521-528` runs *before* `auto-reverted` is added, so the decision itself is unaffected — but any later re-scoring (e.g. a recompute) would be skewed.

**Fix:** Restrict the bonus to the specific risk-bearing filter tags it was meant for (a known set), not "any tag != edit-war". Maintenance/status tags like `auto-reverted`, `patrolled`, etc. should not raise the score.

---

## WB-8 — `classify()` DOI regex is unanchored at the start; plain URLs ending in a DOI-like path are mis-detected

**Severity:** Low

**Evidence:** `worker/src/citelib.ts:17-27`:
```ts
const DOI_RE = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,}\/\S+)$/i;
…
const doi = s.match(DOI_RE);
if (doi) return { kind: "doi", value: doi[1] };
…
if (/^https?:\/\//i.test(s)) return { kind: "url", value: s };
```
`DOI_RE` is anchored only at the end (`$`), and the URL-prefix group is optional. A URL such as `https://example.com/papers/10.1234/abc` matches, capturing `10.1234/abc` as the DOI — and DOI is checked **before** the URL branch.

**Impact:** A user pasting a non-Crossref URL whose path happens to contain a `10.NNNN/...` segment gets routed to the Crossref DOI lookup (`handlers/cite.ts:27-37`) instead of HTML-meta scraping, yielding a 404 ("Couldn't resolve that DOI") for a perfectly fetchable page. The wrong result is then cached for 24h (`CITE_TTL_MS`).

**Fix:** Anchor the DOI pattern at the start (`/^(?:…)?(10\.\d{4,}\/\S+)$/i`) so only bare DOIs or genuine `doi.org`/`doi:` URLs classify as DOI; everything else falls through to the URL branch.

---

## WB-9 — Config (bans/trusted-editors) read via unauthenticated raw CDN: stale ~5 min and null on private repos

**Severity:** Low

**Evidence:** `worker/src/github.ts:63-73`:
```ts
const res = await fetch(`https://raw.githubusercontent.com/${env.REPO_OWNER}/${env.REPO_NAME}/${env.BRANCH}/${file}`);
```
`repoJson` powers `trustedEditors` (`trust.ts:64-67`) and bans (`worker/src/bans.ts`). `raw.githubusercontent.com` serves with a multi-minute CDN cache and **no authentication**.

**Impact:** Adding/removing a maintainer (`trusted-editors.json`) or a ban does not take effect until the raw CDN cache expires (commonly ~5 min). On a private repo, `raw.githubusercontent.com` returns 404/403, so `repoJson` returns `null` → `trustedEditors` is empty and `isBanned` can't see the list, silently disabling both controls. The Worker already holds an authenticated token (`ghToken`) and uses the authenticated contents API elsewhere.

**Fix:** Fetch config files through the authenticated contents API (`gh()` with `getCurrentFile`-style decode) so changes are visible immediately and private repos work; or append a cache-buster and accept the latency explicitly.

---

## WB-10 — Minor: zero-commit `firstMs` and transient-failure caching in `countAuthored`

**Severity:** Low

**Evidence:** `worker/src/trust.ts:110-129`:
```ts
const res = await fetch(base, { headers: await ghHeaders(env) });
if (!res.ok) return { n: 0, firstMs: Date.now() };       // transient failure ⇒ {n:0}
…
if (page.length === 0) return { n: 0, firstMs: Date.now() };
```
and `trust.ts:97-98`:
```ts
const stats = await countAuthored(env, email);
await kvPutJson(env, key, stats, { expirationTtl: TRUST_TTL_S });  // caches the {n:0}
```

A transient GitHub error (rate limit, 5xx) makes `countAuthored` return `{ n: 0, firstMs: Date.now() }`, which `trustStats` then **caches for the full hour**. For an editor who is actually `extended`/`maintainer` (by edit count, not allowlist), this pins them to `open` tier for up to an hour after one flaky API call.

**Impact:** Low frequency, but a single GitHub hiccup can demote a trusted editor's effective tier for an hour (they'd be routed through the PR-review queue instead of publishing live). The maintainer allowlist short-circuits *before* this (`trust.ts:78-79`), so true maintainers are unaffected; auto/extended editors are.

**Fix:** Distinguish "API failed" from "0 commits": on `!res.ok`, throw (let the caller surface a 502) or return a sentinel that is **not** cached, so the next request retries instead of serving a poisoned `{n:0}`.

---

## Notes / verified-NOT-bugs

- **`revertCommit` busts the reverter's trust, not the original author's** (`revert.ts:77`). This is correct: a revert is a *new* commit; the original author's commit still exists in history, so their email-filtered count is unchanged. No invalidation of the original author is needed.
- **`mergePr` 405/409 → null** (`content.ts:568-585`) correctly models "not auto-mergeable" as a non-error and falls into the review queue (`content.ts:390-393`).
- **`autoModerate` errors are swallowed** (`content.ts:379-381`) — intentional: the edit did publish, so a safety-net failure must not error the edit.
- **`enforceFieldPermissions`** (`trust.ts:49-61`) correctly gates protection changes by `max(old, new)` tier.

---

## Verification

Adversarial re-check of every Critical/High finding (WB-1, WB-2, WB-3). Each cited file was re-read from scratch; the GitHub `?author=` semantics were verified against the official REST docs (List commits endpoint: *"GitHub username or email address to use to filter by commit author"* — it matches username OR commit email, **not** the git author name).

- **WB-1 — CONFIRMED (High).** `contributions.ts:48-50` sends `?author=<author>` where for anon `author = anon-<hash>`, which is neither a GitHub username nor an email, so it matches zero commits; `trust.ts:112-114` sends `?author=<email>` = `anon-<hash>@anon.invalid`, which matches the commit author email. The two surfaces genuinely diverge for anon identities, and the in-code comment at `contributions.ts:42-43` ("the login itself works as the email-or-username filter") is provably wrong for the `anon-` case. Evidence and High severity stand.

- **WB-2 — DOWNGRADED (to Medium).** The mechanism is real: shared key `trust:${name}` (`trust.ts:93`) is warmed by two different queries — `?author=<login>` from `contributions.ts:48-52` vs `?author=<noreply-email>` from the `editorTier`→`countAuthored` path (`trust.ts:97,112`). But for the dominant signed-in GitHub case both forms resolve to the same account and the same count, and the report itself concedes "They *usually* resolve to the same account"; the divergence needs edge conditions (off-Worker commits under another email, a changed commit email). Impact on the common path is low, so Medium is the fair rating, not High. (Note: a sharper, unflagged variant exists — Wikigit-provider users carry `wg-<id>@users.wikigit.invalid` per `identity/index.ts:44`, which `?author=<login>` would also fail to match in `contributions.ts`.)

- **WB-3 — CONFIRMED (High).** `editBranch` is deterministic per author+slug (`content.ts:399-401`); the ref-create at `content.ts:445-448` passes no allow-conflict flag, and `gh()` rethrows any non-2xx as `HttpError(502)` (`github.ts:39`). Two concurrent same-author/same-slug submits both observe `ref === undefined` (`content.ts:432-436`) and both POST `/git/refs`; the loser gets GitHub 422 → surfaced as 502, defeating the documented "a retry … reconciles that branch/PR" guarantee (`content.ts:396-398`). Evidence and High severity stand.

**Tally:** 3 High findings checked — 2 CONFIRMED (WB-1, WB-3), 1 DOWNGRADED to Medium (WB-2), 0 refuted. The GitHub `?author=` semantics underpinning WB-1/WB-2 were independently confirmed against the official REST documentation.
