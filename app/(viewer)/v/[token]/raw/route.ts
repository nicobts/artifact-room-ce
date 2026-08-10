import { cookies } from "next/headers";
import { resolveShare, getViewableArtifact } from "@/lib/share";
import { getStorage } from "@/lib/storage";
import { buildArtifactCsp } from "@/lib/csp";
import { injectShim } from "@/lib/viewer-shim/shim";
import { accessCookieName, verifyAccess } from "@/lib/viewer-access";

/**
 * Serves the artifact bytes (with the serve-time measurement shim) under the
 * strict ARTIFACT CSP. Mounted inside the sandboxed iframe by the shell.
 * Re-authorizes on every load: ungated shares pass; gated shares (email,
 * password, or both) pass only with a valid access cookie set by
 * /api/public/unlock.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = resolveShare(token);

  let viewable: { artifact: { storageKey: string } } | null = null;
  if (r.status === "ok") {
    viewable = { artifact: r.artifact };
  } else if (r.status === "gate") {
    // Gated at any protection level (email, password, or both): the bytes are
    // served only against a valid access cookie proving the gate was satisfied.
    const cookie = (await cookies()).get(accessCookieName(r.shareId))?.value;
    if (verifyAccess(r.shareId, cookie)) {
      viewable = getViewableArtifact(token);
    }
  }

  if (!viewable) {
    return new Response("Not available", { status: 403 });
  }

  const storage = await getStorage();
  const blob = await storage.get(viewable.artifact.storageKey);
  if (!blob) {
    return new Response("Not found", { status: 404 });
  }

  const html = injectShim(
    blob.data.toString("utf8"),
    process.env.VIEWER_ORIGIN ?? "",
  );

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": buildArtifactCsp(),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}
