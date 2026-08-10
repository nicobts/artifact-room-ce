import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { markSeen } from "@/lib/notifications";

/**
 * Mark the creator's notifications as seen up to now (upserts the per-creator
 * `notificationsSeenAt` watermark). Creator-side only.
 */
export async function POST() {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  markSeen(session.user.id);
  return NextResponse.json({ ok: true });
}
