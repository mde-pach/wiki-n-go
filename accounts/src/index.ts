import { issuer } from "@openauthjs/openauth";
import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import type { WikigitUser } from "../../shared/wikigit-identity";
import { sendCode, sendNotification } from "./email";
import { isAllowedRedirect } from "./redirect";
import { subjects } from "./subjects";

// File-backed store on a persistent volume: OpenAuth's signing/encryption keys,
// its tokens, AND our account records all survive restarts — so keys don't
// rotate (which would invalidate every issued token) and sign-ins persist.
// Single-instance; swap for Redis/Postgres if this ever needs to scale out.
const store = MemoryStorage({
  persist: process.env.STORE_PATH ?? "/data/auth-store.json",
});

function deriveHandle(email: string): string {
  const base = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "user";
}

// The verified email is the identity; a stable id is minted once. TODO(handle):
// derived from the local-part, so not yet unique — the Engine keys `wg:` off `id`.
async function findOrCreateAccount(email: string): Promise<WikigitUser> {
  const existing = (await store.get(["user", email])) as WikigitUser | undefined;
  const account: WikigitUser = existing ?? {
    id: crypto.randomUUID(),
    email,
    handle: deriveHandle(email),
  };
  if (!existing) await store.set(["user", email], account);
  // Secondary index so a notification can resolve `sub` (the id) → account without
  // scanning the store; backfilled on each sign-in for accounts predating it.
  await store.set(["userById", account.id], account);
  return account;
}

// Shared-secret bearer for the Engine's notification calls (the email path for
// `wg:` users). Unset → `/notify` is disabled (404). See worker/NOTIFY.md.
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN;

// The Engine pushes a wg: notification here — it never holds the address. We
// verify the bearer, resolve sub → account, and send via the same SMTP as sign-in.
// Constant-time bearer check so the shared notify token can't be recovered by
// timing a `!==` comparison byte by byte.
function tokenOk(header: string | null): boolean {
  if (!NOTIFY_TOKEN || !header) return false;
  const expected = `Bearer ${NOTIFY_TOKEN}`;
  const a = new TextEncoder().encode(header);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function handleNotify(req: Request): Promise<Response> {
  if (!NOTIFY_TOKEN) return new Response("notifications disabled", { status: 404 });
  if (!tokenOk(req.headers.get("authorization")))
    return new Response("unauthorized", { status: 401 });
  let data: { sub?: unknown; subject?: unknown; body?: unknown; link?: unknown };
  try {
    data = (await req.json()) as typeof data;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const sub = typeof data.sub === "string" ? data.sub : "";
  const subject = typeof data.subject === "string" ? data.subject : "";
  const body = typeof data.body === "string" ? data.body : "";
  const link = typeof data.link === "string" ? data.link : "";
  if (!sub || !subject || !body) return new Response("missing fields", { status: 400 });
  const user = (await store.get(["userById", sub])) as WikigitUser | undefined;
  if (!user?.email) return new Response("unknown account", { status: 404 });
  try {
    await sendNotification(user.email, subject, body, link);
  } catch {
    return new Response("send failed", { status: 502 });
  }
  return new Response(null, { status: 202 });
}

const app = issuer({
  subjects,
  storage: store,
  // Passwordless: email a 6-digit code (CodeUI renders the screens; we deliver).
  providers: {
    code: CodeProvider(
      CodeUI({
        sendCode: async (claims, code) => {
          await sendCode(String(claims.email), code);
        },
      }),
    ),
  },
  // Only our own federation may complete a sign-in. The authorization code is
  // delivered to redirect_uri, so an unrestricted allowlist is an open redirect:
  // any site could harvest a victim's code and take over the account (PKCE does
  // not help — the attacker is the flow initiator). Restrict to the apex + its
  // subdomains (the `*.wikigit.org` federation), plus localhost for dev.
  allow: async (info) => isAllowedRedirect(info.redirectURI),
  success: async (response, value) => {
    if (value.provider !== "code") throw new Error("Unsupported provider");
    const email = String(value.claims.email).toLowerCase();
    return response.subject("user", await findOrCreateAccount(email));
  },
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: (req: Request) => {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/notify") return handleNotify(req);
    return app.fetch(req);
  },
};
