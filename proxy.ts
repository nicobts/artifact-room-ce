import { NextResponse, type NextRequest } from "next/server";
import { buildShellCsp, buildAppCsp } from "@/lib/csp";

/**
 * Two-origin spine. See `docs/02-architecture.md`.
 *
 * One container serves both the app origin and the viewer origin; we branch on
 * the Host header. This structurally enforces "two identity systems never
 * conflated":
 *   - The viewer origin serves ONLY `/v/*`, `/api/public/*`, and `/healthz`.
 *   - The app origin serves everything EXCEPT `/v/*` (artifacts render only on
 *     the viewer origin, never on the app origin).
 *
 * Dev/CI: app.localhost:3000 (APP_ORIGIN) and view.localhost:3000
 * (VIEWER_ORIGIN). Browsers map *.localhost → 127.0.0.1 with no setup.
 *
 * The strict per-response CSP for the viewer surface and the BetterAuth
 * host-only cookie scoping are added in `viewer-render-sandbox` / `creator-auth`.
 *
 * (Next.js 16: this is the `proxy` convention, formerly `middleware`.)
 */

function hostOf(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

const VIEWER_HOST = hostOf(process.env.VIEWER_ORIGIN);

// Computed once — NODE_ENV and VIEWER_ORIGIN are fixed for the process life.
const APP_CSP = buildAppCsp();

export function proxy(req: NextRequest) {
  const requestHost = req.headers.get("host");
  const { pathname } = req.nextUrl;

  const isViewerOrigin = VIEWER_HOST !== null && requestHost === VIEWER_HOST;

  // The viewer origin exposes NO health/readiness surface (ops-hardening spec).
  // `/preview/*` is the creator preview render (artifact-preview): untrusted
  // HTML, so it lives on the viewer origin like `/v/*`.
  const isViewerPath =
    pathname.startsWith("/v/") ||
    pathname.startsWith("/preview/") ||
    pathname.startsWith("/api/public/");

  if (isViewerOrigin) {
    // On the viewer origin, only viewer-safe paths are reachable.
    if (!isViewerPath) {
      return new NextResponse(null, { status: 404 });
    }
    const res = NextResponse.next();
    // Shell CSP on the viewer page (the raw artifact endpoint sets its own,
    // stricter, artifact CSP and must not be overridden here).
    if (pathname.startsWith("/v/") && !pathname.endsWith("/raw")) {
      res.headers.set("content-security-policy", buildShellCsp());
      res.headers.set("x-frame-options", "DENY");
      res.headers.set("referrer-policy", "no-referrer");
    }
    return res;
  }

  // On the app origin, artifacts are never served — they live on the viewer
  // origin only (defense against rendering untrusted HTML on the app origin).
  if (pathname.startsWith("/v/") || pathname.startsWith("/preview/")) {
    return new NextResponse(null, { status: 404 });
  }

  // Security headers + deny-by-default CSP for the app origin (login, creator
  // console, /admin). frame-src allows only the viewer origin — the preview
  // iframe. The viewer origin sets its own, stricter, per-response policy above.
  const res = NextResponse.next();
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("content-security-policy", APP_CSP);
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains",
    );
  }
  return res;
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
