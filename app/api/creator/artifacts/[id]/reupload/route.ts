import { NextResponse } from "next/server";
import { getCreatorSession } from "@/lib/session";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { reuploadArtifact } from "@/lib/artifacts";
import { MAX_UPLOAD_BYTES } from "@/lib/scan";

const HOUR = 60 * 60 * 1000;

/**
 * Replace an existing artifact's HTML in place (artifact-versioning).
 * Authenticated creator only — no anonymous ingest. Accepts JSON
 * `{ html }` (paste) or multipart `file` (drag-drop) — a single HTML document
 * or a `.zip` bundle normalized at ingest (zip-bundle-upload). Runs the SAME
 * scan-and-reject pipeline as upload; on rejection nothing is stored and the
 * previous version keeps serving. The artifact's shares/tokens/analytics are
 * untouched — links keep working.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCreatorSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Rate limit per creator and (transiently) per IP — no Redis, SQLite-backed.
  const ip = clientIp(req);
  const perUser = checkRateLimit(sqlite, `reupload:user:${session.user.id}`, {
    limit: 30,
    windowMs: HOUR,
  });
  const perIp = checkRateLimit(sqlite, `reupload:ip:${ip}`, {
    limit: 60,
    windowMs: HOUR,
  });
  if (!perUser.allowed || !perIp.allowed) {
    return NextResponse.json(
      { error: "Re-upload rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  // Reject oversized bodies BEFORE buffering into memory (OOM guard, H4).
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  let bytes: Buffer | null = null;
  let declaredContentType: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: "File too large." }, { status: 413 });
        }
        bytes = Buffer.from(await file.arrayBuffer());
        declaredContentType = file.type || undefined;
      }
    } else {
      const body = (await req.json()) as { html?: unknown };
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

  const result = await reuploadArtifact(session.user.id, id, bytes, {
    declaredContentType,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Rejected by the scanner — nothing was stored; previous version still serves.
    return NextResponse.json(
      { error: result.reason, rule: result.rule },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      version: result.version,
      advisories: result.advisories,
      slideCount: result.slideCount,
    },
    { status: 200 },
  );
}
