import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCreatorSession } from "@/lib/session";
import { db, sqlite } from "@/db/client";
import { artifact } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { mintPreviewToken } from "@/lib/preview-token";

const HOUR = 60 * 60 * 1000;

/**
 * Mint a short-lived preview URL for an owned artifact (authenticated, app
 * origin). Ownership is enforced here; the resulting token is verified on the
 * viewer origin by signature alone. Rate-limited.
 */
export async function POST(req: Request) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(sqlite, `preview:${session.user.id}`, {
    limit: 120,
    windowMs: HOUR,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let body: { artifactId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (typeof body.artifactId !== "string") {
    return NextResponse.json({ error: "Missing artifactId." }, { status: 400 });
  }

  const owned = db
    .select({ id: artifact.id, deletedAt: artifact.deletedAt })
    .from(artifact)
    .where(
      and(eq(artifact.id, body.artifactId), eq(artifact.ownerId, session.user.id)),
    )
    .get();
  if (!owned || owned.deletedAt !== null) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const token = mintPreviewToken(body.artifactId);
  const base = process.env.VIEWER_ORIGIN ?? "";
  return NextResponse.json({ url: `${base}/preview/${token}` }, { status: 201 });
}
