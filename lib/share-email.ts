import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Deliberately minimal normalization: trim and lower-case only.
 *
 * Gmail-style dot and "+tag" folding is NOT applied. Treating
 * `j.doe+x@gmail.com` as `jdoe@gmail.com` would silently admit addresses the
 * creator never entered — a gate must never be more generous than the person
 * who configured it.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Constant-time comparison of normalized addresses.
 *
 * Both sides are hashed first so the operands are always 32 bytes:
 * `timingSafeEqual` throws on unequal lengths, and that exception path would
 * itself leak the stored address's length.
 */
export function emailMatches(input: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = createHash("sha256").update(normalizeEmail(input)).digest();
  const b = createHash("sha256").update(normalizeEmail(stored)).digest();
  return timingSafeEqual(a, b);
}
