import { issuer } from "@openauthjs/openauth";
import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import type { WikigitUser } from "../../shared/wikigit-identity";
import { sendCode } from "./email";
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
  if (existing) return existing;
  const account: WikigitUser = {
    id: crypto.randomUUID(),
    email,
    handle: deriveHandle(email),
  };
  await store.set(["user", email], account);
  return account;
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
  // Any https instance (or localhost) may complete a sign-in — safe without
  // per-instance registration because the code is bound to the caller's
  // redirect_uri and each Engine only finishes a flow it started. Consent screen: TODO.
  allow: async (info) => {
    try {
      const u = new URL(info.redirectURI);
      return u.protocol === "https:" || u.hostname === "localhost";
    } catch {
      return false;
    }
  },
  success: async (response, value) => {
    if (value.provider !== "code") throw new Error("Unsupported provider");
    const email = String(value.claims.email).toLowerCase();
    return response.subject("user", await findOrCreateAccount(email));
  },
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
