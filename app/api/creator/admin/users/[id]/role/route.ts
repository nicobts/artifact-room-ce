import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { setUserRole } from "@/lib/users";

const Body = z.object({ role: z.enum(["admin", "member"]) });

/** Promote/demote a user (admin only). 409 = would leave zero admins. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCreatorSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id } = await params;
  const result = setUserRole(id, parsed.role);
  if (result === "not-found") {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  if (result === "last-admin") {
    return NextResponse.json(
      { error: "Cannot demote the last admin" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
