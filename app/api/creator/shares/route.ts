import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { createShare, shareUrl, type Protection } from "@/lib/share";

const HOUR = 60 * 60 * 1000;

/**
 * Create a share of an owned artifact at one of four protection levels
 * (authenticated). Storage (`mode` / `password_hash` / `recipient_email`) is
 * derived in `createShare`, so invalid combinations are unrepresentable here.
 */
export async function POST(req: Request) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(sqlite, `share:create:${session.user.id}`, {
    limit: 100,
    windowMs: HOUR,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let body: {
    artifactId?: unknown;
    protection?: unknown;
    recipientEmail?: unknown;
    recipientLabel?: unknown;
    password?: unknown;
    expiresInDays?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const PROTECTIONS: readonly Protection[] = [
    "public",
    "email",
    "email_password",
    "password",
  ];
  if (
    typeof body.protection !== "string" ||
    !PROTECTIONS.includes(body.protection as Protection)
  ) {
    return NextResponse.json({ error: "Invalid protection." }, { status: 400 });
  }
  if (typeof body.artifactId !== "string") {
    return NextResponse.json({ error: "Missing artifactId." }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + body.expiresInDays * 24 * HOUR);
  }

  const result = await createShare({
    ownerId: session.user.id,
    artifactId: body.artifactId,
    protection: body.protection as Protection,
    recipientEmail:
      typeof body.recipientEmail === "string" ? body.recipientEmail : null,
    recipientLabel:
      typeof body.recipientLabel === "string" ? body.recipientLabel : null,
    password:
      typeof body.password === "string" && body.password ? body.password : null,
    expiresAt,
  });

  if (!result.ok) {
    return result.error === "invalid_protection"
      ? NextResponse.json(
          { error: "Invalid protection combination." },
          { status: 400 },
        )
      : NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  return NextResponse.json(
    { id: result.id, token: result.token, url: shareUrl(result.token) },
    { status: 201 },
  );
}
