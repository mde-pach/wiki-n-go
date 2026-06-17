import nodemailer from "nodemailer";

// SMTP transport from env. SMTP_SECURE=true for implicit TLS (port 465);
// false uses STARTTLS (port 587). Created once and reused.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
  },
});

const FROM = process.env.EMAIL_FROM ?? "no_reply@wikigit.org";

export async function sendCode(email: string, code: string): Promise<void> {
  await transport.sendMail({
    from: FROM,
    to: email,
    // Keep the code out of the subject line (it lingers in notification previews
    // and mailbox lists) — body only.
    subject: "Your Wikigit sign-in code",
    text: `Your Wikigit sign-in code is ${code}.\n\nIt expires shortly. If you didn't request it, you can ignore this email.`,
  });
}

// Collapse to one line + cap length: the subject becomes a mail header, so a CR/LF
// would be header injection, and unbounded length is abuse.
const headerSafe = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200);

// Only embed an https link — never a javascript:/data:/other scheme handed in by
// a caller (the Engine, or anything that obtained NOTIFY_TOKEN).
function safeLink(link: string): string {
  try {
    return new URL(link).protocol === "https:" ? link : "";
  } catch {
    return "";
  }
}

// A wiki notification (reverted / pending review / reply), delivered for the
// Engine — which never sees the address. See accounts/README.md and the Engine's
// worker/NOTIFY.md for the contract.
export async function sendNotification(
  email: string,
  subject: string,
  body: string,
  link: string,
): Promise<void> {
  const url = safeLink(link);
  const text = `${body.slice(0, 4000)}${url ? `\n\n${url}` : ""}`;
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: headerSafe(subject),
    text,
  });
}
