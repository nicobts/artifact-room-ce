import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { artifact, creatorPrefs, event, share } from "@/db/schema";

type Db = typeof defaultDb;
interface Deps {
  db?: Db;
}

/**
 * In-app open-notifications (open-notifications change).
 *
 * IDENTITY BOUNDARY: this is a CREATOR-side READ projection. It NEVER writes at
 * beacon/viewer time — notifications are computed by querying already-recorded
 * `event` rows for the creator's shares, joined `event → share → artifact` and
 * filtered by `artifact.ownerId`. The public viewer/beacon path is untouched, so
 * viewer events never write into a creator-owned notifications table.
 *
 * "Noteworthy" = the share-and-watch validation signals:
 *   - first_open       — the earliest `view` per share (the "did they open it?")
 *   - reopen           — a return visit
 *   - forward_suspected — a new client signal on the same token
 *
 * Unread = event time newer than the per-creator `notificationsSeenAt` watermark
 * (creator_prefs). No watermark yet ⇒ everything is unread.
 */

export type NotificationType = "first_open" | "reopen" | "forward_suspected";

export interface Notification {
  id: string; // stable per noteworthy event; first_open is one-per-share
  type: NotificationType;
  shareId: string;
  artifactId: string;
  artifactTitle: string;
  recipientLabel: string | null;
  shareMode: string;
  createdAt: Date;
  href: string; // deep link to the per-share recipient drill-down
  unread: boolean;
}

function ownerScope(ownerId: string) {
  return and(eq(artifact.ownerId, ownerId), isNull(artifact.deletedAt));
}

function watermark(ownerId: string, db: Db): Date | null {
  const row = db
    .select({ at: creatorPrefs.notificationsSeenAt })
    .from(creatorPrefs)
    .where(eq(creatorPrefs.userId, ownerId))
    .get();
  return row?.at ?? null;
}

/**
 * All noteworthy notifications for a creator, newest first, with unread flags.
 * Computed in one place so `listNotifications` (sliced) and `unreadCount`
 * (filtered) agree. Owner-scoped throughout.
 */
function collect(ownerId: string, db: Db): Notification[] {
  const seenAt = watermark(ownerId, db);
  const isUnread = (d: Date) => seenAt === null || d.getTime() > seenAt.getTime();

  // first_open: earliest `view` per owned share.
  const firstOpens = db
    .select({
      shareId: share.id,
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      recipientLabel: share.recipientLabel,
      shareMode: share.mode,
      at: sql<number>`min(${event.createdAt})`,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(and(ownerScope(ownerId), eq(event.type, "view")))
    .groupBy(share.id)
    .all();

  // reopen + forward_suspected: each individual event is noteworthy.
  const signals = db
    .select({
      id: event.id,
      type: event.type,
      shareId: share.id,
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      recipientLabel: share.recipientLabel,
      shareMode: share.mode,
      at: event.createdAt,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(
      and(
        ownerScope(ownerId),
        inArray(event.type, ["reopen", "forward_suspected"]),
      ),
    )
    .all();

  const href = (artifactId: string, shareId: string) =>
    `/artifacts/${artifactId}/shares/${shareId}`;

  const out: Notification[] = [];

  for (const r of firstOpens) {
    const createdAt = new Date(r.at);
    out.push({
      id: `first_open:${r.shareId}`,
      type: "first_open",
      shareId: r.shareId,
      artifactId: r.artifactId,
      artifactTitle: r.artifactTitle,
      recipientLabel: r.recipientLabel,
      shareMode: r.shareMode,
      createdAt,
      href: href(r.artifactId, r.shareId),
      unread: isUnread(createdAt),
    });
  }

  for (const r of signals) {
    out.push({
      id: r.id,
      type: r.type as NotificationType,
      shareId: r.shareId,
      artifactId: r.artifactId,
      artifactTitle: r.artifactTitle,
      recipientLabel: r.recipientLabel,
      shareMode: r.shareMode,
      createdAt: r.at,
      href: href(r.artifactId, r.shareId),
      unread: isUnread(r.at),
    });
  }

  out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

/** Newest noteworthy notifications for a creator (default 20). Owner-scoped. */
export function listNotifications(
  ownerId: string,
  deps: Deps & { limit?: number } = {},
): Notification[] {
  const db = deps.db ?? defaultDb;
  const limit = deps.limit ?? 20;
  return collect(ownerId, db).slice(0, limit);
}

/** Count of notifications newer than the creator's seen-watermark. */
export function unreadCount(ownerId: string, deps: Deps = {}): number {
  const db = deps.db ?? defaultDb;
  return collect(ownerId, db).filter((n) => n.unread).length;
}

/** Whether the creator opted into first-open emails (default false). */
export function getEmailOnOpen(ownerId: string, deps: Deps = {}): boolean {
  const db = deps.db ?? defaultDb;
  const row = db
    .select({ on: creatorPrefs.emailOnOpen })
    .from(creatorPrefs)
    .where(eq(creatorPrefs.userId, ownerId))
    .get();
  return row?.on ?? false;
}

/** Upsert the creator's notifications "seen" watermark (default: now). */
export function markSeen(
  ownerId: string,
  at: Date = new Date(),
  deps: Deps = {},
): void {
  const db = deps.db ?? defaultDb;
  db.insert(creatorPrefs)
    .values({ userId: ownerId, notificationsSeenAt: at })
    .onConflictDoUpdate({
      target: creatorPrefs.userId,
      set: { notificationsSeenAt: at },
    })
    .run();
}

const LABEL: Record<NotificationType, string> = {
  first_open: "opened",
  reopen: "reopened",
  forward_suspected: "forwarded (suspected)",
};

/** One human line for a notification feed item. Pure. */
export function notificationLine(n: {
  type: NotificationType;
  artifactTitle: string;
  recipientLabel: string | null;
  shareMode: string;
}): string {
  const who =
    n.recipientLabel ?? (n.shareMode === "public" ? "Someone" : "A recipient");
  return `${who} ${LABEL[n.type]} “${n.artifactTitle}”`;
}
