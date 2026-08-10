import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { abuseReport, abuseSignature, artifact, share } from "@/db/schema";

type Db = typeof defaultDb;
interface Deps {
  db?: Db;
}

// --- Reports (public intake) -------------------------------------------------

export interface CreateReportInput {
  reportedToken?: string | null;
  reportedArtifactId?: string | null;
  reason: string;
  details?: string | null;
}

export function createAbuseReport(input: CreateReportInput, deps: Deps = {}): string {
  const db = deps.db ?? defaultDb;
  const id = randomUUID();
  db.insert(abuseReport)
    .values({
      id,
      reportedToken: input.reportedToken ?? null,
      reportedArtifactId: input.reportedArtifactId ?? null,
      reason: input.reason,
      details: input.details ?? null,
    })
    .run();
  return id;
}

export function listReports(deps: Deps = {}) {
  const db = deps.db ?? defaultDb;
  return db.select().from(abuseReport).orderBy(desc(abuseReport.createdAt)).all();
}

export function setReportStatus(
  id: string,
  status: "pending" | "actioned" | "dismissed",
  deps: Deps = {},
): boolean {
  const db = deps.db ?? defaultDb;
  const res = db
    .update(abuseReport)
    .set({ status, handledAt: new Date() })
    .where(eq(abuseReport.id, id))
    .run();
  return res.changes > 0;
}

// --- Signature list (consulted by the upload scanner) ------------------------

export function getEnabledSignatures(deps: Deps = {}): string[] {
  const db = deps.db ?? defaultDb;
  return db
    .select({ pattern: abuseSignature.pattern })
    .from(abuseSignature)
    .where(eq(abuseSignature.enabled, true))
    .all()
    .map((r) => r.pattern);
}

export function listSignatures(deps: Deps = {}) {
  const db = deps.db ?? defaultDb;
  return db
    .select()
    .from(abuseSignature)
    .orderBy(desc(abuseSignature.createdAt))
    .all();
}

export function addSignature(
  input: { pattern: string; note?: string | null; createdBy?: string | null },
  deps: Deps = {},
): string {
  const db = deps.db ?? defaultDb;
  const id = randomUUID();
  db.insert(abuseSignature)
    .values({
      id,
      pattern: input.pattern,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .run();
  return id;
}

export function removeSignature(id: string, deps: Deps = {}): boolean {
  const db = deps.db ?? defaultDb;
  const res = db.delete(abuseSignature).where(eq(abuseSignature.id, id)).run();
  return res.changes > 0;
}

// --- Instant takedown --------------------------------------------------------

export interface TakedownInput {
  token?: string | null;
  artifactId?: string | null;
}

export interface TakedownResult {
  revokedShares: number;
  softDeletedArtifact: boolean;
}

/**
 * Admin takedown: revoke a share by token and/or soft-delete an artifact and
 * revoke ALL its shares. Effective immediately — resolution fails closed with
 * no cache/purge step.
 */
export function adminTakedown(input: TakedownInput, deps: Deps = {}): TakedownResult {
  const db = deps.db ?? defaultDb;
  const now = new Date();
  let revokedShares = 0;
  let softDeletedArtifact = false;

  if (input.token) {
    const row = db
      .select({ id: share.id })
      .from(share)
      .where(eq(share.token, input.token))
      .get();
    if (row) {
      db.update(share).set({ revokedAt: now }).where(eq(share.id, row.id)).run();
      revokedShares += 1;
    }
  }

  if (input.artifactId) {
    const res = db
      .update(artifact)
      .set({ deletedAt: now })
      .where(eq(artifact.id, input.artifactId))
      .run();
    softDeletedArtifact = res.changes > 0;

    const shares = db
      .select({ id: share.id })
      .from(share)
      .where(and(eq(share.artifactId, input.artifactId)))
      .all();
    for (const s of shares) {
      db.update(share).set({ revokedAt: now }).where(eq(share.id, s.id)).run();
      revokedShares += 1;
    }
  }

  return { revokedShares, softDeletedArtifact };
}
