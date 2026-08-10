import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { artifact } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import type { StorageAdapter } from "@/lib/storage";
import { scanHtml } from "@/lib/scan";
import { isZip, normalizeBundle, MAX_INLINED_BYTES } from "@/lib/bundle";

type Db = typeof defaultDb;

type NormalizedIngest =
  | {
      ok: true;
      bytes: Buffer;
      declaredContentType?: string;
      maxBytes?: number;
      advisories: string[];
    }
  | { ok: false; rule: string; reason: string };

/**
 * Zip bundles (detected by magic bytes, never client metadata) are normalized
 * at ingest into ONE single-file HTML document (zip-bundle-upload). Everything
 * downstream — scan, storage, serving — is the unchanged single-file pipeline.
 * Non-zip uploads pass through byte-for-byte.
 */
function normalizeIngest(
  bytes: Buffer,
  declaredContentType?: string,
): NormalizedIngest {
  if (!isZip(bytes)) {
    return { ok: true, bytes, declaredContentType, advisories: [] };
  }
  const bundle = normalizeBundle(bytes);
  if (!bundle.ok) return bundle;
  return {
    ok: true,
    bytes: bundle.bytes,
    declaredContentType: "text/html",
    maxBytes: MAX_INLINED_BYTES,
    advisories: ["bundle-inlined"],
  };
}

export interface CreateArtifactInput {
  ownerId: string;
  title: string;
  bytes: Buffer;
  declaredContentType?: string;
}

export type CreateArtifactResult =
  | { ok: true; id: string; advisories: string[]; slideCount: number | null }
  | { ok: false; rule: string; reason: string };

interface Deps {
  db?: Db;
  storage?: StorageAdapter;
}

/**
 * Authenticated ingest core: scan -> (reject, store NOTHING) | (store unmodified
 * bytes + insert artifact row). Bytes are written byte-for-byte (no branding,
 * no rewrite). Dependencies are injectable for testing.
 */
export async function createArtifact(
  input: CreateArtifactInput,
  deps: Deps = {},
): Promise<CreateArtifactResult> {
  const { parseSlideCount } = await import("@/lib/slidecount");
  const { getEnabledSignatures } = await import("@/lib/abuse");
  const database = deps.db ?? defaultDb;
  const storage = deps.storage ?? (await getStorage());

  const normalized = normalizeIngest(input.bytes, input.declaredContentType);
  if (!normalized.ok) {
    return { ok: false, rule: normalized.rule, reason: normalized.reason };
  }
  const bytes = normalized.bytes;

  const html = bytes.toString("utf8");
  const verdict = await scanHtml(bytes, html, {
    declaredContentType: normalized.declaredContentType,
    maxBytes: normalized.maxBytes,
    // Admin-managed signatures (abuse-takedown) tighten the scanner at runtime.
    signatures: getEnabledSignatures({ db: database }),
  });
  if (!verdict.ok) {
    return { ok: false, rule: verdict.rule, reason: verdict.reason };
  }

  const advisories = [...normalized.advisories, ...verdict.advisories];
  const slideCount = parseSlideCount(html);
  const storageKey = `art_${randomUUID()}`;
  // Single-file uploads are stored byte-for-byte; bundles store the disclosed
  // normalized document (`bundle-inlined` advisory). Never any branding.
  await storage.put(storageKey, bytes, "text/html");

  const id = randomUUID();
  database
    .insert(artifact)
    .values({
      id,
      ownerId: input.ownerId,
      title: input.title,
      storageKey,
      contentType: "text/html",
      slideCount,
      sizeBytes: bytes.length,
      scanAdvisories: advisories,
    })
    .run();

  return { ok: true, id, advisories, slideCount };
}

export type ReuploadArtifactResult =
  | { ok: true; advisories: string[]; slideCount: number | null; version: number }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "rejected"; rule: string; reason: string };

/**
 * Replace an existing artifact's HTML in place (artifact-versioning). The
 * artifact id, its shares, and their tokens are UNCHANGED — already-sent links
 * keep working and historical analytics (keyed to `share`) persist. Untrusted
 * HTML runs through the SAME scan-and-reject pipeline as initial upload; a
 * rejection writes nothing and leaves the old blob/row intact. A fresh
 * `storageKey` is used (old blob retained for potential rollback), and `version`
 * is bumped. Owner-scoped: not-owned/missing/deleted → `not_found` (no leak).
 */
export async function reuploadArtifact(
  ownerId: string,
  id: string,
  bytes: Buffer,
  deps: Deps & { declaredContentType?: string } = {},
): Promise<ReuploadArtifactResult> {
  const { parseSlideCount } = await import("@/lib/slidecount");
  const { getEnabledSignatures } = await import("@/lib/abuse");
  const database = deps.db ?? defaultDb;
  const storage = deps.storage ?? (await getStorage());

  const existing = getArtifact(ownerId, id, { db: database });
  if (!existing) return { ok: false, error: "not_found" };

  const normalized = normalizeIngest(bytes, deps.declaredContentType);
  if (!normalized.ok) {
    // Rejected — store NOTHING, keep the previous version serving.
    return { ok: false, error: "rejected", rule: normalized.rule, reason: normalized.reason };
  }
  const finalBytes = normalized.bytes;

  const html = finalBytes.toString("utf8");
  const verdict = await scanHtml(finalBytes, html, {
    declaredContentType: normalized.declaredContentType,
    maxBytes: normalized.maxBytes,
    signatures: getEnabledSignatures({ db: database }),
  });
  if (!verdict.ok) {
    // Rejected — store NOTHING, keep the previous version serving.
    return { ok: false, error: "rejected", rule: verdict.rule, reason: verdict.reason };
  }

  const advisories = [...normalized.advisories, ...verdict.advisories];
  const slideCount = parseSlideCount(html);
  const storageKey = `art_${randomUUID()}`; // new key — old blob remains for rollback
  await storage.put(storageKey, finalBytes, "text/html"); // normalized-or-unmodified bytes

  const nextVersion = existing.version + 1;
  database
    .update(artifact)
    .set({
      storageKey,
      sizeBytes: finalBytes.length,
      scanAdvisories: advisories,
      slideCount,
      updatedAt: new Date(),
      version: nextVersion,
    })
    .where(and(eq(artifact.id, id), eq(artifact.ownerId, ownerId)))
    .run();

  return { ok: true, advisories, slideCount, version: nextVersion };
}

/** A single non-deleted artifact, owner-scoped. Null if missing or not owned. */
export function getArtifact(ownerId: string, id: string, deps: Deps = {}) {
  const database = deps.db ?? defaultDb;
  return (
    database
      .select()
      .from(artifact)
      .where(
        and(
          eq(artifact.id, id),
          eq(artifact.ownerId, ownerId),
          isNull(artifact.deletedAt),
        ),
      )
      .get() ?? null
  );
}

/** Non-deleted artifacts owned by a creator, newest first. */
export function listArtifacts(ownerId: string, deps: Deps = {}) {
  const database = deps.db ?? defaultDb;
  return database
    .select()
    .from(artifact)
    .where(and(eq(artifact.ownerId, ownerId), isNull(artifact.deletedAt)))
    .orderBy(desc(artifact.createdAt))
    .all();
}

/** Soft-delete (owner-scoped). Returns true if a row was deleted. */
export function softDeleteArtifact(
  ownerId: string,
  id: string,
  deps: Deps = {},
): boolean {
  const database = deps.db ?? defaultDb;
  const result = database
    .update(artifact)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(artifact.id, id),
        eq(artifact.ownerId, ownerId),
        isNull(artifact.deletedAt),
      ),
    )
    .run();
  return result.changes > 0;
}
