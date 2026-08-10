import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import {
  listNotifications,
  unreadCount,
  notificationLine,
  getEmailOnOpen,
} from "@/lib/notifications";
import { maybeEmailFirstOpens } from "@/lib/email";

/**
 * Creator-side notifications feed (open-notifications). Read projection over
 * the creator's own events — never the viewer/beacon path. Not cached (live
 * engagement signal). Returns formatted lines so the client stays dumb and the
 * `server-only` formatting boundary is preserved.
 */
export async function GET() {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = session.user.id;
  const notifications = listNotifications(ownerId, { limit: 20 });

  // Best-effort, off-by-default email on first opens (open-notifications).
  // Fire-and-forget: never blocks or fails the feed response, no-ops unless the
  // creator opted in AND SMTP is configured.
  void maybeEmailFirstOpens(
    session.user.email ?? undefined,
    getEmailOnOpen(ownerId),
    notifications,
  );

  const items = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    line: notificationLine(n),
    href: n.href,
    createdAt: n.createdAt.getTime(),
    unread: n.unread,
  }));

  return NextResponse.json(
    { items, unread: unreadCount(ownerId) },
    { headers: { "cache-control": "no-store" } },
  );
}
