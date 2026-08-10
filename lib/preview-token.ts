import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, signed, short-lived **preview token** (artifact-preview).
 *
 * Minted only by an authenticated owner on the app origin; verifiable on the
 * viewer origin with a pure HMAC check — no DB row, no share, and (critically)
 * no creator session. It is NOT a share: it never mints a viewer_session or an
 * event, so a creator previewing their own artifact never pollutes the moat.
 *
 * Ownership is enforced at MINT time (the mint route checks artifact.ownerId);
 * the token thereafter only encodes the artifactId + expiry, and the short TTL
 * bounds exposure. Pure module — safe to import on the viewer origin.
 */

const TTL_MS = 15 * 60 * 1000; // 15 minutes

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

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function mintPreviewToken(
  artifactId: string,
  now: number = Date.now(),
  ttlMs: number = TTL_MS,
): string {
  const payload = JSON.stringify({ a: artifactId, e: now + ttlMs });
  const p = Buffer.from(payload, "utf8").toString("base64url");
  return `${p}.${sign(p)}`;
}

export function verifyPreviewToken(
  token: string,
  now: number = Date.now(),
): { artifactId: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const p = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time signature check first (reject tampered tokens).
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(p));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: { a?: unknown; e?: unknown };
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.a !== "string" || typeof payload.e !== "number") return null;
  if (payload.e <= now) return null; // expired
  return { artifactId: payload.a };
}
