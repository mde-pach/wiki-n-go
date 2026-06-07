import { issuer } from "@openauthjs/openauth";
import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import { object, string } from "valibot";

interface Env {
  AUTH_KV: KVNamespace;
  EMAIL: { send(msg: OutgoingEmail): Promise<{ messageId: string }> };
  EMAIL_FROM: string;
  ALLOWED_ORIGIN: string; // comma-separated Engine origins allowed to sign in
}

// The new Cloudflare Email Sending binding (no MIME assembly, no API key).
interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

interface Account {
  id: string;
  email: string;
  handle: string;
}

// The JWT payload the Engine receives. `id` is the stable, unique identity —
// key trust/bans off this. `handle` is a display label (not yet unique, see the
// findOrCreateAccount TODO).
const subjects = createSubjects({
  user: object({ id: string(), email: string(), handle: string() }),
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Built per-request: a Worker only sees its bindings inside fetch, and the
    // issuer/providers need them (KV storage, the email sender).
    return issuer({
      subjects,
      storage: CloudflareStorage({ namespace: env.AUTH_KV }),
      // Passwordless: email a 6-digit code (CodeUI renders the enter-email +
      // enter-code screens; we only supply delivery). The whole "magic link".
      providers: {
        code: CodeProvider(
          CodeUI({
            sendCode: async (claims, code) => {
              await sendCode(env, String(claims.email), code);
            },
          }),
        ),
      },
      // Only let our own Engine instances complete a sign-in (open-redirect guard).
      allow: async (info) => {
        const allowed = env.ALLOWED_ORIGIN.split(",").map((s) => s.trim());
        try {
          return allowed.includes(new URL(info.redirectURI).origin);
        } catch {
          return false;
        }
      },
      success: async (response, value) => {
        if (value.provider !== "code") throw new Error("Unsupported provider");
        const email = String(value.claims.email).toLowerCase();
        return response.subject("user", await findOrCreateAccount(env, email));
      },
    }).fetch(request, env, ctx);
  },
};

async function sendCode(env: Env, email: string, code: string): Promise<void> {
  await env.EMAIL.send({
    to: email,
    from: env.EMAIL_FROM,
    subject: `Your Wikigit sign-in code: ${code}`,
    text: `Your Wikigit sign-in code is ${code}.\n\nIt expires shortly. If you didn't request it, ignore this email.`,
  });
}

// The verified email is the identity; a stable id is minted once and never
// changes. TODO(handle): derived from the email local-part, so it isn't unique
// yet (two alice@… collide) — add a handle picker + reservation before the
// handle keys anything. Until then the Engine keys `wg:` off `id`, not `handle`.
async function findOrCreateAccount(env: Env, email: string): Promise<Account> {
  const key = `user:${email}`;
  const existing = await env.AUTH_KV.get<Account>(key, "json");
  if (existing) return existing;
  const account: Account = {
    id: crypto.randomUUID(),
    email,
    handle: deriveHandle(email),
  };
  await env.AUTH_KV.put(key, JSON.stringify(account));
  return account;
}

function deriveHandle(email: string): string {
  const base = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "user";
}
