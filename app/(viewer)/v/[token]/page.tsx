import { cookies } from "next/headers";
import { resolveShare } from "@/lib/share";
import { accessCookieName, verifyAccess } from "@/lib/viewer-access";
import { ViewerFrame } from "@/components/viewer-frame";
import { ViewerUnlockForm } from "@/components/viewer-unlock-form";

/**
 * Viewer shell (viewer origin only). Resolves the share, applies the access
 * gate, and mounts the sandboxed artifact frame. Deliberately minimal — no
 * branding, no creator session, no heavy client UI.
 */
export default async function ViewerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = resolveShare(token);

  if (r.status === "ok") {
    return <ViewerFrame token={token} />;
  }

  if (r.status === "gate") {
    const cookie = (await cookies()).get(accessCookieName(r.shareId))?.value;
    if (verifyAccess(r.shareId, cookie)) {
      return <ViewerFrame token={token} />;
    }
    return (
      <ViewerUnlockForm
        token={token}
        needsEmail={r.needsEmail}
        needsPassword={r.needsPassword}
      />
    );
  }

  // denied — unknown / revoked / expired, deliberately indistinguishable.
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-medium">This link isn’t available</h1>
        <p className="text-sm text-muted-foreground">
          The share may have been revoked, expired, or never existed.
        </p>
      </div>
    </main>
  );
}
