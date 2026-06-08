import { issuer } from "@openauthjs/openauth";
import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import type { WikigitUser } from "../../shared/wikigit-identity";
import { subjects } from "./subjects";

interface Env {
  AUTH_KV: KVNamespace;
  EMAIL: { send(msg: OutgoingEmail): Promise<{ messageId: string }> };
  EMAIL_FROM: string;
}

// The new Cloudflare Email Sending binding (no MIME assembly, no API key).
interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

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
      // Any https instance (or localhost in dev) may complete a sign-in. This is
      // safe without per-instance registration: the auth code is bound to the
      // caller's redirect_uri and each Engine only finishes a flow it started, so
      // an assertion can't be replayed at another instance — the worst case is a
      // site learning a handle, which a consent screen (TODO) will gate.
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
async function findOrCreateAccount(env: Env, email: string): Promise<WikigitUser> {
  const key = `user:${email}`;
  const existing = await env.AUTH_KV.get<WikigitUser>(key, "json");
  if (existing) return existing;
  const account: WikigitUser = {
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
