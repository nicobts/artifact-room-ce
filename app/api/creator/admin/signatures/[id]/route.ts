import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { removeSignature } from "@/lib/abuse";

/** Remove a signature (admin only). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCreatorSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!removeSignature(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
