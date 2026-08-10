import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for share gates — scrypt (Node built-in, no dependency).
 * Plaintext is never stored or logged. Format:
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 */
const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
