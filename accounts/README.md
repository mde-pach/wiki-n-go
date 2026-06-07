# Wikigit Accounts (the IdP)

The centralised **Wikigit account** provider (SPEC M10) — a standalone Cloudflare
Worker running [OpenAuth](https://openauth.js.org). One purpose only: prove an
email and hand the Engine a signed identity. No passwords, no social, nothing else.

- **Sign-in:** passwordless email **code** (OpenAuth `CodeProvider` + `CodeUI`).
- **Delivery:** Cloudflare **Email Sending** binding (`env.EMAIL.send`) — no API key.
- **Storage:** one KV namespace (OpenAuth flow/refresh tokens **and** account records).
- **Identity:** the JWT subject `{ id, email, handle }`. `id` is stable + unique;
  `handle` is display-only (not yet unique — see the `findOrCreateAccount` TODO).

Separate from the Engine on purpose: the no-DB / single-Worker invariant binds the
*Engine*; this account store lives outside it.

## Setup

```sh
bun install
# 1. Verify a domain in Cloudflare Email Routing, set EMAIL_FROM to an address on it.
# 2. Point ALLOWED_ORIGIN at your Engine origin(s).
bun run dev          # emails are logged to the console locally
bun run deploy       # auto-provisions the KV namespace on first deploy
```

## How the Engine consumes it (follow-up, not yet wired)

The Engine's `wikigit` provider (`worker/src/identity/providers.ts`) was drafted
against generic OIDC (discovery → token → **userinfo**). OpenAuth is OAuth2 + JWT,
not OIDC, so swap that provider to OpenAuth's client:

```ts
import { createClient } from "@openauthjs/openauth/client";
// authorizeUrl → client.authorize(redirectUri, "code").url
// exchange     → client.exchange(code, redirectUri) → client.verify(subjects, tokens.access)
//                → { id, email, handle }  (verified via the issuer's JWKS)
```

Then `wikigitWriter` keys `wg:` off the stable **`id`** (not `handle`). The flow is
PKCE/public-client, so the Engine needs only `WIKIGIT_ISSUER` + `WIKIGIT_CLIENT_ID`
— **drop `WIKIGIT_CLIENT_SECRET`**.
