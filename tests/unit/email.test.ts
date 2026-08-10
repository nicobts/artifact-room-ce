import { describe, it, expect, beforeEach } from "vitest";
import {
  emailConfigured,
  firstOpenDigest,
  maybeEmailFirstOpens,
} from "@/lib/email";
import type { Notification } from "@/lib/notifications";

function open(over: Partial<Notification> = {}): Notification {
  return {
    id: `first_open:${over.shareId ?? "s1"}`,
    type: "first_open",
    shareId: "s1",
    artifactId: "a1",
    artifactTitle: "Pitch",
    recipientLabel: "Jane",
    shareMode: "recipient",
    createdAt: new Date(0),
    href: "/artifacts/a1/shares/s1",
    unread: true,
    ...over,
  };
}

describe("email (optional, flag-gated)", () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST;
  });

  it("is disabled when SMTP_HOST is unset", () => {
    expect(emailConfigured()).toBe(false);
  });

  it("no-ops when not configured, even if opted in", async () => {
    const res = await maybeEmailFirstOpens("creator@example.com", true, [open()]);
    expect(res).toEqual({ sent: false, reason: "disabled" });
  });

  it("no-ops when not opted in", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    const res = await maybeEmailFirstOpens("creator@example.com", false, [open()]);
    expect(res.sent).toBe(false);
  });

  it("formats a single-open digest", () => {
    const { subject, text } = firstOpenDigest([open()]);
    expect(subject).toBe('Someone opened “Pitch”');
    expect(text).toContain("Jane opened “Pitch”");
  });

  it("formats a multi-open digest with a count and public fallback", () => {
    const { subject, text } = firstOpenDigest([
      open({ shareId: "s1" }),
      open({ shareId: "s2", recipientLabel: null, shareMode: "public" }),
    ]);
    expect(subject).toBe("2 new opens on your shares");
    expect(text).toContain("Someone opened");
  });
});
