import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Share-token primitives (docs/04-data-model.md).
 *
 * Tokens are OPAQUE and RANDOM (not signed/JWT): generated here, stored, and
 * looked up by the unique `share.token` index. Revocation is a single row
 * update — no signing-key rotation. Never derive a token from a sequential id.
 */

/** High-entropy, URL-safe share token (32 bytes = 256 bits, well above the ≥128-bit floor). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time token comparison. Belt-and-suspenders alongside the indexed
 * unique-column lookup. Length mismatch returns false early (only token length,
 * never content, can be inferred).
 */
export function timingSafeEqualToken(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Minimal shape `isShareUsable` needs (timestamp_ms columns surface as Date). */
export interface ShareUsabilityFields {
  revokedAt: Date | null;
  expiresAt: Date | null;
}

/** A share is usable when it is neither revoked nor past its expiry. */
export function isShareUsable(
  share: ShareUsabilityFields,
  now: Date = new Date(),
): boolean {
  if (share.revokedAt !== null) return false;
  if (share.expiresAt !== null && share.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}
