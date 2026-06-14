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
    subject: `Your Wikigit sign-in code: ${code}`,
    text: `Your Wikigit sign-in code is ${code}.\n\nIt expires shortly. If you didn't request it, you can ignore this email.`,
  });
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
  await transport.sendMail({
    from: FROM,
    to: email,
    subject,
    text: link ? `${body}\n\n${link}` : body,
  });
}
