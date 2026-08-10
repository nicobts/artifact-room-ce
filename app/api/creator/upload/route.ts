import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { createArtifact } from "@/lib/artifacts";
import { MAX_UPLOAD_BYTES } from "@/lib/scan";

const HOUR = 60 * 60 * 1000;

/**
 * Authenticated artifact ingest — NO anonymous endpoint exists.
 * Accepts JSON `{ title, html }` (paste) or multipart `file` (drag-drop) —
 * either a single HTML document or a `.zip` bundle (one root HTML + assets/),
 * which is normalized to a single-file document at ingest (zip-bundle-upload).
 * Scans and rejects before storing anything.
 */
export async function POST(req: Request) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit per creator and (transiently) per IP — no Redis, SQLite-backed.
  const ip = clientIp(req);
  const perUser = checkRateLimit(sqlite, `upload:user:${session.user.id}`, {
    limit: 30,
    windowMs: HOUR,
  });
  const perIp = checkRateLimit(sqlite, `upload:ip:${ip}`, {
    limit: 60,
    windowMs: HOUR,
  });
  if (!perUser.allowed || !perIp.allowed) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  // Reject oversized bodies BEFORE buffering into memory (OOM guard, H4).
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  let title = "Untitled artifact";
  let bytes: Buffer | null = null;
  let declaredContentType: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const rawTitle = form.get("title");
      if (typeof rawTitle === "string" && rawTitle.trim()) {
        title = rawTitle.trim();
      }
      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: "File too large." }, { status: 413 });
        }
        bytes = Buffer.from(await file.arrayBuffer());
        declaredContentType = file.type || undefined;
        if (title === "Untitled artifact" && file.name) {
          title = file.name.replace(/\.(html?|zip)$/i, "");
        }
      }
    } else {
      const body = (await req.json()) as { title?: unknown; html?: unknown };
      if (typeof body.title === "string" && body.title.trim()) {
        title = body.title.trim();
      }
      if (typeof body.html === "string") {
        bytes = Buffer.from(body.html, "utf8");
        declaredContentType = "text/html";
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!bytes || bytes.length === 0) {
    return NextResponse.json({ error: "No HTML provided." }, { status: 400 });
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  const result = await createArtifact({
    ownerId: session.user.id,
    title,
    bytes,
    declaredContentType,
  });

  if (!result.ok) {
    // Rejected by the scanner — nothing was stored.
    return NextResponse.json(
      { error: result.reason, rule: result.rule },
      { status: 422 },
    );
  }

  return NextResponse.json(
    { id: result.id, advisories: result.advisories, slideCount: result.slideCount },
    { status: 201 },
  );
}
