import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { addSignature } from "@/lib/abuse";

/** Add a known-bad signature (admin only). Effective at the next scan — no redeploy. */
export async function POST(req: Request) {
  const session = await getCreatorSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { pattern?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  if (!pattern) {
    return NextResponse.json({ error: "Pattern required" }, { status: 400 });
  }

  const id = addSignature({
    pattern,
    note: typeof body.note === "string" ? body.note : null,
    createdBy: session.user.id,
  });
  return NextResponse.json({ id }, { status: 201 });
}
