# Code Quality, Factorization & Patterns — Wikigit

Dimension audit of `src/` (Astro 5 + Solid islands) and `worker/src/` (single Cloudflare Worker).
Focus: duplication, module cohesion, Solid/Astro idioms, TypeScript boundaries, naming/comment hygiene.

Overall the codebase is in genuinely good shape for a pre-release: comment hygiene closely follows CLAUDE.md (comments explain *why*, almost no "what" narration), there is **no `any` / `as any` anywhere** in `src` or `worker`, the route table is a clean dispatch map, and shared helpers (`useSubmit`, `clientResource`, `gh`, `commitPayload`, `ViewHead/ErrorNote/Status`) already exist. Findings are therefore weighted toward **missed factorization that an existing helper almost covers** and a few real correctness-adjacent smells — not boilerplate-hardening theater.

## Summary

| ID | Title | Severity |
|----|-------|----------|
| CQ-1 | Repo-JSON-list moderation handlers (bans/rights/suppress) are near-identical copies | High |
| CQ-2 | Frontmatter parsing is forked into 3 regexes + 2 parsers across the boundary | High |
| CQ-3 | Five admin tabs hand-roll the same "list + add-form + remove" CRUD island | High |
| CQ-4 | `EditResult` / `EditOutcome` is a flag-bag, not a discriminated union | Medium |
| CQ-5 | Five components bypass the project's own `clientResource` helper | Medium |
| CQ-6 | Worker & app duplicate domain types (`Tier`, `Ban`, `Suppression`, identity) with no `shared/` | Medium |
| CQ-7 | Lifecycle handlers (move/merge/split) repeat the "gate + two-commit + redirect stub" body | Medium |
| CQ-8 | `?page=` / query-param reads re-implemented in ~8 islands | Low |
| CQ-9 | `Rights.tsx` pads table rows with empty `<span/>` placeholders | Low |
| CQ-10 | `isInSiteRef` / `refIdentity` ref-naming convention scattered as string ops | Low |

---

## CQ-1 — Repo-JSON-list moderation handlers are near-identical copies (High)

**Evidence:**
- `worker/src/handlers/bans.ts:20` `writeBans()` — `getCurrentFile` → mutate list → `gh PUT contents` with `JSON.stringify(list,null,2)+"\n"` → `appendAudit`.
- `worker/src/handlers/rights.ts:33` `writeEditors()` — same shape (`EDITORS_PATH`, `parseEditors`, PUT, audit).
- `worker/src/handlers/suppress.ts:24` `writeSuppressed()` — same shape (`SUPPRESSED_PATH`, `parseSuppressions`, PUT, audit).
- Each also re-implements: `requireMaintainer(...)` → `getCurrentFile(repo, PATH)` → parse → filter-out-existing → push → write → `appendAudit`. The `unban`/`unsuppress`/`revoke` halves repeat the "`filter`; if `next.length === list.length` throw 404" idiom verbatim (`bans.ts:97`, `suppress.ts:90`, `rights.ts:52`).

The three files differ only in: the filename constant, the parse/serialize functions, the item shape, and the audit action string. `requireMaintainer` is called **21 times** across the handlers (grep), and the "load a root JSON list, edit it, commit it, audit it" body is copied ~6 times.

**Impact:** Any change to the storage convention (e.g. switch root JSON files to a directory, add `expires` to entries which SPEC lists as a TODO for bans, change the commit-message format, add optimistic-concurrency retry on a stale blob `sha`) must be made in 3+ places and is easy to miss one. This is the single biggest factorization win in the worker.

**Fix:** Introduce a small typed "repo JSON list store" helper, e.g.:

```ts
// worker/src/repo-list.ts
interface ListStore<T> { path: string; parse(raw?: string): T[]; serialize(item: T): unknown; }
async function mutateList<T>(env, request, store, action, mut, audit): Promise<...> {
  const writer = await requireMaintainer(env, request, action.label);
  const repo = repoSlug(env);
  const current = await getCurrentFile(env, repo, store.path);
  const next = mut(store.parse(current?.raw), writer);
  await gh(env, `/repos/${repo}/contents/${store.path}`, { method:"PUT",
    body: commitPayload(env, { message: action.message, content: jsonFile(next), branch: env.BRANCH, sha: current?.sha, author: writer }) });
  await appendAudit(env, repo, writer.name, writer.email, action.audit, action.target, action.detail);
}
```

`ban`/`unban`/`grant`/`revoke`/`suppress`/`unsuppress` each collapse to a parse/mutate closure. Estimated ~120 lines removed across the three files. (Bonus: a single `repoSlug(env)` = `` `${env.REPO_OWNER}/${env.REPO_NAME}` `` would also kill the ~30 inline repetitions of that template literal throughout the worker.)

---

## CQ-2 — Frontmatter parsing forked into 3 regexes + 2 parser variants (High)

**Evidence (grep `^---`):**
- `src/lib/frontmatter.ts:31` `FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/` (+ `parseFrontmatter`, `splitFrontmatter`, `withFrontmatter`, using the `yaml` package).
- `worker/src/trust.ts:27` `frontmatter()` with its *own* regex `/^---\r?\n([\s\S]*?)\r?\n---/` (note: no trailing `\r?\n?`, subtly different) and its own `parseYaml`.
- `worker/src/indexlib.ts:107` a *third* regex `/^---\r?\n[\s\S]*?\r?\n---\r?\n?/` used to strip the block.

So frontmatter is parsed by at least three independently-maintained regexes. The worker's `trust.frontmatter` and the app's `parseFrontmatter` return the same `Record<string,unknown>`/`PageMeta` shape but cannot share code because there is no shared module (see CQ-6). The worker's variant lacking the trailing-newline match means a body could be parsed slightly differently between the index builder and the trust gate.

**Impact:** Protection enforcement (`pageTier`, `enforceFieldPermissions`) reads frontmatter via `trust.frontmatter`; the index builder strips it via a *different* regex; the editor round-trips via `splitFrontmatter`/`withFrontmatter`. A future frontmatter feature (multi-doc, `---` inside a code fence, CRLF edge cases) must be fixed in three regexes, and a drift between them is a latent protection-bypass class of bug. This is the canonical "repeated frontmatter/YAML handling" the brief calls out.

**Fix:** One `frontmatter` module exported to both sides (place it under a real `shared/` — see CQ-6 — or have the worker import a copy generated from one source). At minimum, the worker should have a single internal `frontmatter.ts` that both `trust.ts` and `indexlib.ts` import, so the regex exists once per build target. Define the canonical regex as one exported constant.

---

## CQ-3 — Five admin tabs hand-roll the same list+form+remove island (High)

**Evidence:** `Bans.tsx`, `Suppression.tsx`, `Rights.tsx` are structurally the same component:
- `createResource(() => (isServer ? undefined : true), listX)` (`Bans.tsx:9`, `Suppression.tsx:14`, `Rights.tsx:8`).
- `const [busy,setBusy]`, `const [error,setError]`, a `submit(e)` with `e.preventDefault()` → `setBusy(true)` → `try { await addX(); reset fields; refetch() } catch { setError(errMessage(e)) } finally { setBusy(false) }` (`Bans.tsx:19-40`, `Suppression.tsx:24-40`, `Rights.tsx:16-31`).
- A `remove`/`unban` handler with the optimistic-mutate-or-refetch pattern.
- The same JSX scaffold: `<ViewHead>` + `<form class="ban-form">` of `.ban-input`s + `<Show when={list()} fallback>` + `<For each>` rows of `.ban-row` (`Suppression.tsx` literally reuses the `ban-form`/`ban-row`/`ban-list` CSS classes — `Suppression.tsx:59,96,98`).

`Protection.tsx` is a fourth variant (form-only, no list). `MovePage.tsx`/`MergePage.tsx`/`SplitPage.tsx` are a fifth family of the same "one form → call worker → show done" shape (`MergePage.tsx:17`, `SplitPage.tsx:30`).

**Impact:** Eight-plus islands repeat busy/error/submit wiring that `useSubmit` (`src/lib/solid.ts:42`) already centralizes for the lifecycle forms but the admin tabs *don't use it*. Adding e.g. a confirm-before-remove, a loading spinner convention, or input validation means touching every tab.

**Fix:** Two moves:
1. Make the admin CRUD tabs use the existing `useSubmit` (it already gives `busy`/`error`/`setError`/`run`) instead of re-declaring `busy`/`error`/`submit`. The PoW solve inside `useSubmit.run` is harmless for maintainer-gated calls (it returns a no-op token).
2. Extract a generic `<ListManager items=... fields=... onAdd=... onRemove=... renderRow=.../>` (or at least a `useListResource` hook returning `{items, add, remove}` with the optimistic-mutate built in). Bans/Suppression/Rights become ~30-line declarations of fields + row renderer.

---

## CQ-4 — `EditResult`/`EditOutcome` is a flag-bag, not a discriminated union (Medium)

**Evidence:** `src/lib/api.ts:4`:
```ts
export interface EditResult { author: string; live: boolean; prUrl?: string; url?: string; autoReverted?: boolean; }
```
and the mirror `EditOutcome` in `worker/src/handlers/content.ts:257`. The legal states are: published-live (`live:true, url`), published-then-reverted (`live:false, autoReverted:true, url`), and queued-for-review (`live:false, prUrl`). These are mutually exclusive but encoded as four independent optionals, so `url` and `prUrl` are both `string | undefined` and the consumer must reason about which combination is valid. The NDJSON stream events in `api.ts:104` are likewise a single interface with all-optional `progress`/`result`/`status`/`error` keyed by a `type` field — a textbook discriminated-union candidate that is currently a wide bag.

**Impact:** TypeScript can't prove the editor handles every outcome; a refactor that, say, adds a "conflict" outcome won't surface missing branches. The brief explicitly flags "discriminated unions for the NDJSON/edit results" as a target.

**Fix:** Model the outcome as a union and the stream as one:
```ts
type EditResult =
  | { kind: "live"; author: string; sha: string; url: string }
  | { kind: "reverted"; author: string; sha: string; url: string }
  | { kind: "pending"; author: string; prUrl: string };
type StreamEvent =
  | { type: "progress"; progress: number; label: string }
  | { type: "done"; result: EditResult }
  | { type: "error"; status: number; error: string };
```
Then `submitEdit`'s loop (`api.ts:96-118`) and the editor's result handling get exhaustive `switch`es. Share the type (CQ-6).

---

## CQ-5 — Five components bypass the project's own `clientResource` helper (Medium)

**Evidence:** `src/lib/solid.ts:10` defines `clientResource`, a typed wrapper whose whole purpose is "createResource that never runs during SSR" so callers stop writing the `isServer ? undefined : ...` source by hand. Yet (grep `isServer ? undefined : true`) five components inline the raw `createResource(() => (isServer ? undefined : true), fn)`:
`Bans.tsx:9`, `Suppression.tsx:14`, `Rights.tsx:8`, `ReviewQueue.tsx:17`, `LangBar.tsx`. `RecentChanges.tsx:16` even inlines `() => (isServer ? undefined : 30)`. Meanwhile `History.tsx:17` and `ReviewQueue.tsx:24` (the diff) *do* use `clientResource`, so the codebase is inconsistent with itself about its own abstraction.

**Impact:** The helper exists precisely to prevent this boilerplate and to centralize the SSR-guard rule (memory note: "No partial SSR/hydration" — islands must not fetch during SSR). Five call sites re-implement the guard, so the rule isn't enforced in one place; a future change to how SSR-suspension works (e.g. honoring an `initial`) won't reach them.

**Fix:** Replace those `createResource(() => (isServer ? undefined : true), fn)` calls with `clientResource(fn)` (and the `: 30` / `: true` source forms with the two-arg `clientResource(source, fn)`). Mechanical, removes the `isServer` import from those files.

---

## CQ-6 — Worker & app duplicate domain types with no real `shared/` (Medium)

**Evidence:** The only shared file is `shared/wikigit-identity.ts` (one `WikigitUser` interface), and its own comment (`shared/wikigit-identity.ts:4`) explains it's deliberately dependency-free because the IdP and Engine build separately. But the **app↔worker** boundary has no such sharing and the types are copied:
- `Tier = "open"|"auto"|"extended"|"maintainer"` is declared in `worker/src/trust.ts:9` **and** `src/lib/api.ts:12`.
- `Ban` / `Suppression` / `AuditEntry` shapes live in `src/lib/admin.ts:3,11,76` and are re-derived on the worker as `NormalBan` (`worker/src/bans.ts`), `Suppression` (`worker/src/suppression.ts`), `AuditEntry` (`worker/src/audit.ts`).
- `EditResult` (app, `api.ts:4`) vs `EditOutcome` (worker, `content.ts:257`) — same fields, two names.
- `WhoAmI` (app, `api.ts:14`) mirrors `whoami`'s inline return type (`worker/src/identity/index.ts:105`).

**Impact:** Every wire-shape is asserted twice and can silently drift (the worker returns `{author, tier, avatar, isAnon}`; the app's `WhoAmI` must match by hand). This is the "shared types between worker & app" gap the brief names. It also blocks fixing CQ-2/CQ-4 cleanly.

**Fix:** Add a `shared/` (or `worker/shared` re-exported) module of pure interface/`type` declarations for the request bodies + response shapes (`Tier`, `WhoAmI`, `EditResult`, `Change`, `Ban`, `Suppression`, `AuditEntry`, the NDJSON `StreamEvent`). Both `tsconfig`s can `include` it; it has zero runtime, so the "two Workers can't share node_modules" constraint (which is about runtime deps) doesn't apply to type-only `.ts`. The worker handlers then return values *typed as* the shared shape, catching drift at compile time.

---

## CQ-7 — Lifecycle handlers repeat the gate + two-commit + redirect-stub body (Medium)

**Evidence:** `worker/src/handlers/content.ts:590` `movePage`, and `worker/src/handlers/lifecycle.ts:49` `mergePages` / `:109` `splitPage` share a body:
1. `String(body.x ?? "")` coercion of each field, `assertSlug`-style validation, `from === to` check.
2. `resolve(env, request, {token, path})` → `Promise.all([editorTier, getCurrentFile(from), getCurrentFile(to)])`.
3. tier check vs `pageTier(...)` (`requireTier` in lifecycle, inline in move).
4. two `gh PUT contents` with `commitPayload`, the second writing a `redirectStub`.
5. `invalidateContent`.

`redirectStub` is even defined twice: `lifecycle.ts:42` `redirectStub()` and inline in `content.ts:626` (`` `---\nredirect: ${to}\n---\n\n#REDIRECT [[${to}]]\n` ``). `move` lives in `content.ts` while `merge`/`split` live in `lifecycle.ts`, so the trio is split across files despite being one family.

**Impact:** The redirect-stub format and the move-gating logic exist in two places; a change to the stub (e.g. add `redirect_reason`) or to the gating (e.g. honor `expires`) can diverge. Cohesion suffers: `movePage` is the odd one out in `content.ts`.

**Fix:** Move `movePage` into `handlers/lifecycle.ts` beside its siblings (it *is* a lifecycle op per FEATURES §O) and have all three use the shared `redirectStub`, `assertSlug`, `requireTier`, `higherTier` helpers already in `lifecycle.ts`. Optionally extract a `gatedTwoCommit({from,to, fromContent, toContent, requiredTier})` to fold the common shape.

---

## CQ-8 — Query-param reads re-implemented in ~8 islands (Low)

**Evidence (grep):** `isServer ? "" : (new URLSearchParams(location.search).get("page") ?? "")` appears identically in `MovePage.tsx:9`, `SplitPage.tsx:12`, `MergePage.tsx:10`; `NewPage.tsx:12` wraps it as a local `qp(name)`; `Editor.tsx` reads `new URLSearchParams(window.location.search)` four times (`:113,:130,:154,:192`); `RecentChanges.tsx:29`, `Special.tsx:159`, `Setup.tsx:35`, `WikiPage.tsx:116` each re-construct it with their own SSR guard. The SSR-safety check (`isServer`/`typeof window`) is applied inconsistently (some guard, some don't).

**Impact:** Minor duplication, but the inconsistent SSR guarding is a real (small) hydration-mismatch risk given the project's "no partial SSR" invariant.

**Fix:** A one-liner `src/lib/query.ts`: `export const queryParam = (name: string) => isServer ? "" : new URLSearchParams(location.search).get(name) ?? "";` (already exactly what `NewPage`'s local `qp` is). Replace the inline reads.

---

## CQ-9 — `Rights.tsx` pads table rows with empty `<span/>` placeholders (Low)

**Evidence:** `src/components/Rights.tsx:71-75` and `:82-87` emit literal `<span />` `<span />` `<span />` to fill the `.ban-row` grid columns it borrows from Bans. The owner row hand-codes three empty spans; the editor row two.

**Impact:** Markup-as-layout-spacer is brittle (it silently breaks if `.ban-row`'s column count changes) and is a symptom of CQ-3 (Rights is forcing itself into Bans' 5-column grid it doesn't fit). Reads poorly.

**Fix:** Give Rights its own grid/class with the columns it actually has, or once CQ-3's `ListManager` exists, declare only the columns present. Remove the empty spans.

---

## CQ-10 — Branch-naming convention scattered as ad-hoc string ops (Low)

**Evidence:** The `anon-<hash>/<slug>` and `gh-<login>/<slug>` branch convention is encoded by string slicing in several spots: `editBranch` (`content.ts:399`), `isInSiteRef` (`content.ts:175`) `startsWith("anon-")||startsWith("gh-")`, `refIdentity` (`content.ts:179`) `seg.startsWith("gh-") ? slice(3)`, and again in `RecentChanges`/`History` the display tests `author.startsWith("anon-")` (`RecentChanges.tsx` `isAnon`, `History.tsx:186,188`). The `gh-` prefix is also produced inline in `editBranch`.

**Impact:** The identity-encoding rule (how a branch/author string maps to {author, isAnon}) is the kind of cross-cutting convention that should have one home; today a change to the prefix scheme touches the writer, the queue, and two display components.

**Fix:** Centralize as a tiny module: `encodeBranch(writer, slug)`, `parseRef(ref): {author, isAnon}`, `isAnonName(name)`. `isInSiteRef`/`refIdentity` already live together in `content.ts` — export them plus an `isAnonName` and have the display components import it instead of re-testing `startsWith("anon-")`.

---

## Notes on what is already good (so the team doesn't "fix" it)

- **Comment hygiene** is strong and matches CLAUDE.md: comments explain constraints/tradeoffs (`content.ts:352`, `identity/index.ts:63`, `http.ts:69`), not line-by-line "what". Don't strip these.
- **Router** (`worker/src/index.ts`) is a flat, readable dispatch map with a single try/catch and consistent `HttpError → status` mapping — *not* a god-function despite its length; leave the shape.
- **No `any`** anywhere in `src`/`worker`; request bodies are typed as `{ x?: unknown }` and coerced at the edge — correct boundary discipline.
- **Astro island directives** are appropriate: content/Toc/PageMeta are `client:load` (needed before paint), `PatrolMeta` is `client:idle` (`PageShell.astro:158`), and auth/setup/forms are `client:only="solid-js"` (avoid SSR/hydration mismatch on per-user chrome) — consistent with the "no partial SSR" memory.
- `useSubmit` and `clientResource` are the right abstractions — the fix for CQ-3/CQ-5 is to *use them more*, not add new ones.
