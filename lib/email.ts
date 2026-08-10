import "server-only";
import { logger } from "@/lib/log";
import type { Notification } from "@/lib/notifications";

/**
 * Optional, flag-gated SMTP notifier (open-notifications — secondary feature).
 *
 * OFF BY DEFAULT. The in-app bell works with no email at all. Email delivery is
 * a no-op (logged) unless `SMTP_HOST` is set AND the creator opted in
 * (`creator_prefs.emailOnOpen`). To keep the container lean for the common
 * (disabled) case, `nodemailer` is an OPTIONAL peer dependency resolved via a
 * dynamic import only when SMTP is configured; if it isn't installed we log and
 * no-op rather than fail. This never touches the viewer/beacon path.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export interface SendResult {
  sent: boolean;
  reason?: "disabled" | "no-transport" | "error";
}

/** Pure subject/body for a first-open digest. Exported for unit testing. */
export function firstOpenDigest(opens: Notification[]): {
  subject: string;
  text: string;
} {
  const n = opens.length;
  const subject =
    n === 1
      ? `Someone opened “${opens[0].artifactTitle}”`
      : `${n} new opens on your shares`;
  const lines = opens.map((o) => {
    const who =
      o.recipientLabel ?? (o.shareMode === "public" ? "Someone" : "A recipient");
    return `• ${who} opened “${o.artifactTitle}”`;
  });
  const text = `${lines.join("\n")}\n\nOpen your console to see per-recipient detail.`;
  return { subject, text };
}

async function sendMail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "disabled" };

  // Optional dependency — present only if the operator installed it. The dynamic
  // specifier is intentionally not statically resolvable so the build/typecheck
  // doesn't require `nodemailer` to be installed for the (default) disabled case.
  const moduleName = "nodemailer";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodemailer: any;
  try {
    nodemailer = await import(/* webpackIgnore: true */ moduleName);
  } catch {
    logger.warn("SMTP_HOST is set but `nodemailer` is not installed — email skipped.");
    return { sent: false, reason: "no-transport" };
  }

  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "artifact-room@localhost",
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    logger.warn({ err }, "Failed to send open-notification email (best-effort).");
    return { sent: false, reason: "error" };
  }
}

// Best-effort, at-most-once-per-process dedupe so a 60s poll doesn't re-email
// the same first-open. In-memory by design: a restart may resend once, which is
// acceptable for an off-by-default, best-effort signal (no schema/PII added).
const emailed = new Set<string>();

/**
 * Best-effort: email the creator about first-open notifications they have not
 * been emailed about yet (this process). No-op unless opted in AND configured.
 * Safe to call from a creator-side request handler; never blocks the response.
 */
export async function maybeEmailFirstOpens(
  to: string | undefined,
  optedIn: boolean,
  notifications: Notification[],
): Promise<SendResult> {
  if (!optedIn || !to || !emailConfigured()) return { sent: false, reason: "disabled" };
  const fresh = notifications.filter(
    (n) => n.type === "first_open" && !emailed.has(n.id),
  );
  if (fresh.length === 0) return { sent: false, reason: "disabled" };

  for (const n of fresh) emailed.add(n.id);
  const { subject, text } = firstOpenDigest(fresh);
  return sendMail(to, subject, text);
}
