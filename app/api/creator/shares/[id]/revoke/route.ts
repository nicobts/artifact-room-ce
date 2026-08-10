import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { revokeShare } from "@/lib/share";

/** Revoke an owned share immediately. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!revokeShare(session.user.id, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
