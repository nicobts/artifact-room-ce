import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { softDeleteArtifact } from "@/lib/artifacts";

/** Soft-delete an owned artifact (sets deletedAt; blob GC happens on a later sweep). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const deleted = softDeleteArtifact(session.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
