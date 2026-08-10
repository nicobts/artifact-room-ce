import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { artifact, share } from "@/db/schema";
import type { Artifact, Share } from "@/db/schema";
import { generateToken } from "@/lib/share-token";
import { hashPassword, verifyPassword } from "@/lib/password";
import { emailMatches, normalizeEmail } from "@/lib/share-email";

type Db = typeof defaultDb;
interface Deps {
  db?: Db;
}

/**
 * What the creator picks. Storage is DERIVED from it — `protection` is never a
 * column. A stored copy would drift from `mode`/`passwordHash` the first time
 * one was written without the other.
 */
export type Protection = "public" | "email" | "email_password" | "password";

/**
 * What the console displays. The two legacy values describe combinations the
 * previous API allowed (mode and password were independent controls) and the
 * four protection levels can no longer produce. They are shown, never
 * rewritten: backfilling someone's existing share into a policy they did not
 * choose is worse than showing them the truth.
 */
export type DisplayProtection =
  | Protection
  | "link_only_legacy"
  | "password_no_recipient_legacy";

export interface CreateShareInput {
  ownerId: string;
  artifactId: string;
  protection: Protection;
  recipientEmail?: string | null;
  recipientLabel?: string | null;
  password?: string | null;
  expiresAt?: Date | null;
}

export type CreateShareResult =
  | { ok: true; id: string; token: string }
  // not_found also covers not-owner — we do not distinguish, to avoid leaking
  // existence of artifacts the caller doesn't own.
  | { ok: false; error: "not_found" | "invalid_protection" };

interface ProtectionShape {
  mode: "public" | "recipient" | "email_gated";
  needsEmail: boolean;
  needsPassword: boolean;
  allowsPassword: boolean;
}

function shapeOf(protection: Protection): ProtectionShape {
  switch (protection) {
    case "public":
      return {
        mode: "public",
        needsEmail: false,
        needsPassword: false,
        allowsPassword: false,
      };
    case "email":
      return {
        mode: "email_gated",
        needsEmail: true,
        needsPassword: false,
        allowsPassword: false,
      };
    case "email_password":
      return {
        mode: "email_gated",
        needsEmail: true,
        needsPassword: true,
        allowsPassword: true,
      };
    case "password":
      // Per-recipient link: the address identifies the recipient for
      // attribution, but the viewer is never asked to type it.
      return {
        mode: "recipient",
        needsEmail: true,
        needsPassword: true,
        allowsPassword: true,
      };
  }
}

export async function createShare(
  input: CreateShareInput,
  deps: Deps = {},
): Promise<CreateShareResult> {
  const db = deps.db ?? defaultDb;
  const shape = shapeOf(input.protection);

  const email = input.recipientEmail ? normalizeEmail(input.recipientEmail) : null;
  const password = input.password || null;

  // Validate before touching the database — an invalid combination must never
  // reach a write, and must never be representable through this API.
  if (shape.needsEmail && !email) return { ok: false, error: "invalid_protection" };
  if (shape.needsPassword && !password) {
    return { ok: false, error: "invalid_protection" };
  }
  if (!shape.allowsPassword && password) {
    return { ok: false, error: "invalid_protection" };
  }

  const owned = db
    .select({ id: artifact.id })
    .from(artifact)
    .where(and(eq(artifact.id, input.artifactId), eq(artifact.ownerId, input.ownerId)))
    .get();
  if (!owned) return { ok: false, error: "not_found" };

  const id = randomUUID();
  const token = generateToken();
  db.insert(share)
    .values({
      id,
      artifactId: input.artifactId,
      token,
      mode: shape.mode,
      recipientLabel: input.recipientLabel ?? null,
      recipientEmail: email,
      passwordHash: password ? hashPassword(password) : null,
      expiresAt: input.expiresAt ?? null,
    })
    .run();

  return { ok: true, id, token };
}

/** Read stored fields back as a protection level, including legacy states. */
export function deriveProtection(s: {
  mode: string;
  passwordHash: string | null;
}): DisplayProtection {
  const hasPassword = s.passwordHash !== null;
  if (s.mode === "public") {
    return hasPassword ? "password_no_recipient_legacy" : "public";
  }
  if (s.mode === "email_gated") return hasPassword ? "email_password" : "email";
  return hasPassword ? "password" : "link_only_legacy";
}

export type ResolveResult =
  | { status: "ok"; share: Share; artifact: Artifact }
  // shareId is an opaque random id (leaks no artifact info) — the viewer shell
  // uses it to check the access cookie and to render the right fields.
  | { status: "gate"; shareId: string; needsEmail: boolean; needsPassword: boolean }
  | { status: "denied" };

/**
 * Accountless token resolution — fail-closed. Enforces revoke + expiry on every
 * call (no caching).
 *
 * `denied` deliberately collapses unknown / revoked / expired / wrong-credential
 * into one outcome. Distinguishing them turns this into an oracle for which
 * tokens exist and which addresses are registered. Callers MUST NOT re-expand
 * it into separate viewer-visible reasons.
 */
export function resolveShare(
  token: string,
  credentials: { email?: string; password?: string } = {},
  deps: Deps = {},
  now: Date = new Date(),
): ResolveResult {
  const db = deps.db ?? defaultDb;

  const row = db.select().from(share).where(eq(share.token, token)).get();
  if (!row) return { status: "denied" };
  if (row.revokedAt !== null) return { status: "denied" };
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return { status: "denied" };
  }

  const needsEmail = row.mode === "email_gated";
  const needsPassword = row.passwordHash !== null;

  if (needsEmail || needsPassword) {
    const suppliedAny =
      (needsEmail && credentials.email !== undefined) ||
      (needsPassword && credentials.password !== undefined);

    // Nothing offered yet — tell the shell which fields to render.
    if (!suppliedAny) {
      return { status: "gate", shareId: row.id, needsEmail, needsPassword };
    }

    // Evaluate BOTH factors before deciding, so the work done — and therefore
    // the time taken — does not reveal which one failed first.
    const emailOk =
      !needsEmail || emailMatches(credentials.email ?? "", row.recipientEmail);
    const passwordOk =
      !needsPassword ||
      verifyPassword(credentials.password ?? "", row.passwordHash ?? "");
    if (!emailOk || !passwordOk) return { status: "denied" };
  }

  const art = db.select().from(artifact).where(eq(artifact.id, row.artifactId)).get();
  if (!art || art.deletedAt !== null) return { status: "denied" };

  return { status: "ok", share: row, artifact: art };
}

/**
 * Returns the share + artifact for a token whose share is usable (not revoked,
 * not expired, artifact not deleted), IGNORING the password gate. Used ONLY by
 * the raw artifact endpoint AFTER it has verified the password-access cookie.
 */
export function getViewableArtifact(
  token: string,
  deps: Deps = {},
  now: Date = new Date(),
): { share: Share; artifact: Artifact } | null {
  const db = deps.db ?? defaultDb;
  const row = db.select().from(share).where(eq(share.token, token)).get();
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  const art = db.select().from(artifact).where(eq(artifact.id, row.artifactId)).get();
  if (!art || art.deletedAt !== null) return null;
  return { share: row, artifact: art };
}

/** Revoke an owned share immediately (next resolve fails closed). Owner-scoped. */
export function revokeShare(
  ownerId: string,
  shareId: string,
  deps: Deps = {},
): boolean {
  const db = deps.db ?? defaultDb;
  const owned = db
    .select({ id: share.id })
    .from(share)
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(and(eq(share.id, shareId), eq(artifact.ownerId, ownerId)))
    .get();
  if (!owned) return false;

  const res = db
    .update(share)
    .set({ revokedAt: new Date() })
    .where(eq(share.id, shareId))
    .run();
  return res.changes > 0;
}

/** Shares for an owned artifact, newest first. Empty if not owned. */
export function listShares(ownerId: string, artifactId: string, deps: Deps = {}) {
  const db = deps.db ?? defaultDb;
  const owned = db
    .select({ id: artifact.id })
    .from(artifact)
    .where(and(eq(artifact.id, artifactId), eq(artifact.ownerId, ownerId)))
    .get();
  if (!owned) return [];
  return db
    .select()
    .from(share)
    .where(eq(share.artifactId, artifactId))
    .orderBy(desc(share.createdAt))
    .all();
}

/** Public viewer URL for a token (viewer origin). */
export function shareUrl(token: string): string {
  const base = process.env.VIEWER_ORIGIN ?? "";
  return `${base}/v/${token}`;
}
