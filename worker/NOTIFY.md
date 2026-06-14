# Notifications — write-time, no store

The Engine holds **no notification state**. Each event is pushed, the moment it
happens, into a system that already delivers durably:

| Recipient | Channel | Who sends |
|---|---|---|
| `gh:<login>` | an `@login` in the GitHub artifact (revert PR / pending-review PR / Discussion comment) | GitHub, per the user's own notification settings |
| `wg:<sub>` | the IdP's SMTP (already wired for sign-in) | the IdP, via `POST /notify` |
| anonymous | — | unreachable by design (no contact info is ever stored) |

There is no in-memory queue, no index, and no `notifications.*` file — events are
caught at write-time and routed by identity. See `src/notify.ts`.

## Events

- **Reverted / rolled back** — the affected author (recovered from the reverted
  commit's author email via `keyFromCommitEmail`) is notified.
- **Pending review** — when an edit opens a PR, the wiki's maintainers
  (`trusted-editors.json` ∪ `wikigit.json` maintainers) are notified.
- **Replied-to** — prior participants of a talk thread are notified when a new
  comment lands. `gh:` participants are subscribed by an `@login` on their *first*
  comment (GitHub then notifies natively); `wg:` participants get an email.

## The companion endpoint — **implemented** in `accounts/` (`auth.wikigit.org`)

`POST /notify` is built in the IdP app (`accounts/src/index.ts`); it verifies the
bearer, resolves `sub → email` via a `["userById", id]` index, and sends through
the same SMTP as sign-in. Set `NOTIFY_TOKEN` on the IdP and the matching
`IDP_MAIL_TOKEN` + `IDP_MAIL_URL=https://auth.wikigit.org/notify` on the Engine.


The Engine calls it for `wg:` recipients only. Configure the Engine with
`IDP_MAIL_URL` (e.g. `https://auth.wikigit.org/notify`) and a shared
`IDP_MAIL_TOKEN`. If `IDP_MAIL_URL` is unset the email path is inert and `gh:`
users are still reached by GitHub.

```
POST {IDP_MAIL_URL}
Authorization: Bearer {IDP_MAIL_TOKEN}
Content-Type: application/json

{ "sub": "<wikigit account sub>", "subject": "...", "body": "...", "link": "https://..." }

→ 202 Accepted   (queued/sent; the Engine ignores the body and never retries)
→ 4xx/5xx        (the Engine swallows it — delivery is best-effort)
```

The IdP resolves `sub → email` from its own account store (the address never
leaves the IdP) and sends via its existing SMTP. It SHOULD verify the bearer and
MAY rate-limit per `sub`. Keep the call fast / fire-and-forget: the Engine awaits
it only within the triggering request and treats any failure as a no-op.
