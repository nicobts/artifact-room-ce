import { randomUUID, createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { viewerSession } from "@/db/schema";

type Db = typeof defaultDb;

/** Reopen = same clientId returning after this gap. */
export const REOPEN_GAP_MS = 30 * 60 * 1000;

/**
 * Coarse server-side corroboration signal. Hash of UA +
 * accept-language — NEVER a raw IP, never stored as identity. Used only to
 * corroborate forwarding.
 */
export function computeServerSignalHash(ua: string, acceptLanguage: string): string {
  return createHash("sha256")
    .update(`${ua}\n${acceptLanguage}`)
    .digest("hex")
    .slice(0, 32);
}

export interface SessionResolution {
  viewerSessionId: string;
  isNew: boolean;
  isReopen: boolean;
  isForward: boolean;
}

/**
 * Stitch a beacon to a `viewer_session` keyed by (shareId, clientId).
 *  - returning clientId after a gap  -> reopen
 *  - a NEW clientId on a token that already has another clientId -> forward_suspected
 */
export function resolveOrCreateViewerSession(
  db: Db,
  shareId: string,
  clientId: string,
  serverSignalHash: string,
  now: number = Date.now(),
): SessionResolution {
  const existing = db
    .select()
    .from(viewerSession)
    .where(
      and(eq(viewerSession.shareId, shareId), eq(viewerSession.clientId, clientId)),
    )
    .get();

  if (existing) {
    const last = (existing.lastSeenAt ?? existing.firstSeenAt).getTime();
    const isReopen = now - last > REOPEN_GAP_MS;
    db.update(viewerSession)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(viewerSession.id, existing.id))
      .run();
    return { viewerSessionId: existing.id, isNew: false, isReopen, isForward: false };
  }

  // New clientId. Forwarding suspected if another clientId already viewed this share.
  const other = db
    .select({ id: viewerSession.id })
    .from(viewerSession)
    .where(
      and(eq(viewerSession.shareId, shareId), ne(viewerSession.clientId, clientId)),
    )
    .get();
  const isForward = Boolean(other);

  const id = randomUUID();
  db.insert(viewerSession)
    .values({ id, shareId, clientId, serverSignalHash, lastSeenAt: new Date(now) })
    .run();
  return { viewerSessionId: id, isNew: true, isReopen: false, isForward };
}
