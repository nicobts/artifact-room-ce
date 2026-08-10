import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { adminTakedown, setReportStatus } from "@/lib/abuse";

/** Instant takedown (admin only): revoke a share by token and/or soft-delete an artifact. */
export async function POST(req: Request) {
  const session = await getCreatorSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { token?: unknown; artifactId?: unknown; reportId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = adminTakedown({
    token: typeof body.token === "string" ? body.token : null,
    artifactId: typeof body.artifactId === "string" ? body.artifactId : null,
  });

  if (typeof body.reportId === "string") {
    setReportStatus(body.reportId, "actioned");
  }

  return NextResponse.json(result);
}
