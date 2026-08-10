import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that a viewer cleared a share's password gate. Set as an httpOnly,
 * host-only cookie on the viewer origin after a successful unlock; checked by
 * the shell and the raw artifact endpoint so the password isn't re-sent on
 * every frame load. HMAC over the (random, opaque) shareId — reveals nothing.
 */
function secret(): string {
  const s = process.env.VIEWER_ACCESS_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (s) return s;
  // Fail closed in production: never sign with a public, shipped constant.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VIEWER_ACCESS_SECRET or BETTER_AUTH_SECRET must be set in production.",
    );
  }
  return "dev-insecure-secret";
}

export function accessCookieName(shareId: string): string {
  return `av_${shareId}`;
}

export function signAccess(shareId: string): string {
  return createHmac("sha256", secret()).update(shareId).digest("hex");
}

export function verifyAccess(shareId: string, value: string | undefined): boolean {
  if (!value) return false;
  const expected = signAccess(shareId);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
