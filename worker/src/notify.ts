import type { Env } from "./types";

// Write-time notifications. We hold NO notification state: each event is pushed,
// the moment it happens, into a system that already delivers durably —
//   • GitHub users: an `@login` in the GitHub artifact (the caller adds it), so
//     GitHub notifies them natively (mentions / Discussion subscription).
//   • Wikigit (email) users: the IdP, which alone holds their address, sends mail
//     via the SMTP it already runs for sign-in (see NOTIFY.md for the contract).
//   • Anonymous editors have no contact channel by design — unreachable.
// Best-effort: a notification must never fail or slow the action that triggered it.

export interface MailNote {
  subject: string;
  body: string;
  link: string;
}

// Recover the provider-qualified identity key from a commit-author email — the
// inverse of the writer emails minted in identity/index.ts. Lets the revert path
// route a notification from git alone, without threading identity through.
export function keyFromCommitEmail(email: string): string | null {
  const wg = email.match(/^wg-(.+)@users\.wikigit\.invalid$/);
  if (wg) return `wg:${wg[1]}`;
  const gh = email.match(/^\d+\+([^@]+)@users\.noreply\.github\.com$/);
  if (gh) return `gh:${gh[1]}`;
  return null; // anon / bot / unknown → unreachable
}

// The GitHub login to `@`-mention for a gh: key (so GitHub notifies them natively),
// or null for non-GitHub identities.
export function mentionFor(key: string): string | null {
  return key.startsWith("gh:") ? key.slice(3) : null;
}

// Ask the IdP to email a wg: user. No-op unless mail is configured AND the key is
// a wg identity (only the IdP holds the address; gh users go via GitHub, anon is
// unreachable). Never throws — delivery is best-effort.
export async function notifyByEmail(
  env: Env,
  key: string,
  note: MailNote,
): Promise<void> {
  if (!env.IDP_MAIL_URL || !key.startsWith("wg:")) return;
  const sub = key.slice(3);
  try {
    await fetch(env.IDP_MAIL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.IDP_MAIL_TOKEN
          ? { authorization: `Bearer ${env.IDP_MAIL_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ sub, ...note }),
    });
  } catch {
    // best-effort: a mail hiccup must never break the action that triggered it
  }
}
