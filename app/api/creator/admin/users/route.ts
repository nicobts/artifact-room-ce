import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listUsers } from "@/lib/users";

/** List all users with roles (admin only). */
export async function GET() {
  const session = await getCreatorSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    users: listUsers().map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}
