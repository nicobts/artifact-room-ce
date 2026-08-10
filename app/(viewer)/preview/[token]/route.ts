import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { artifact } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { buildPreviewCsp } from "@/lib/csp";
import { verifyPreviewToken } from "@/lib/preview-token";

/**
 * Creator preview render (artifact-preview). Verifies a signed preview token
 * (HMAC + expiry) — NO creator session, NO share row — and serves the owner's
 * artifact bytes under the preview CSP. The measurement shim is intentionally
 * NOT injected, and no viewer_session/event is created: a preview never touches
 * analytics. Untrusted HTML, so it is served only here on the viewer origin.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const v = verifyPreviewToken(token);
  if (!v) return new Response("Not available", { status: 403 });

  const art = db
    .select()
    .from(artifact)
    .where(eq(artifact.id, v.artifactId))
    .get();
  if (!art || art.deletedAt !== null) {
    return new Response("Not available", { status: 403 });
  }

  const storage = await getStorage();
  const blob = await storage.get(art.storageKey);
  if (!blob) return new Response("Not found", { status: 404 });

  // Bytes are served verbatim — NO shim injection (preview records nothing).
  return new Response(blob.data.toString("utf8"), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": buildPreviewCsp(),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}
