/**
 * Content-Security-Policy builders (viewer-render-sandbox, ADR 7).
 *
 * Two distinct policies:
 *  - ARTIFACT (untrusted, opaque-origin iframe): inline allowed (safe under the
 *    opaque origin), but `connect-src 'none'` and `form-action 'none'` are
 *    UNCONDITIONAL — the two channels that weaponize hostile HTML. External
 *    passive subresources are blocked unless the operator opts into a curated
 *    CDN allowlist via VIEWER_CDN_ALLOWLIST.
 *  - SHELL (our trusted viewer page): no untrusted content. `script-src` keeps
 *    `'unsafe-inline'` because Next.js injects inline bootstrap/flight scripts;
 *    nonce-based hardening is a documented follow-up. frame-ancestors 'none'.
 */

function cdnAllowlist(): string {
  return (process.env.VIEWER_CDN_ALLOWLIST ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildArtifactCsp(allowlist: string = cdnAllowlist()): string {
  const cdn = allowlist ? ` ${allowlist}` : "";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'self'${cdn}`,
    `style-src 'unsafe-inline' 'self'${cdn}`,
    `img-src 'self' data: blob:${cdn}`,
    `font-src 'self' data:${cdn}`,
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    // Enforce opaque-origin isolation even on DIRECT top-level navigation to
    // /v/<token>/raw (the iframe `sandbox` attribute only covers embedding).
    // `allow-scripts` (no `allow-same-origin`) keeps postMessage-to-parent
    // working while denying same-origin DOM/storage access.
    "sandbox allow-scripts",
    "frame-ancestors 'self'",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * PREVIEW CSP (artifact-preview): identical to the artifact CSP except that it
 * permits framing by the APP origin so the authenticated creator console can
 * embed an in-console preview. `connect-src 'none'` and `form-action 'none'`
 * remain unconditional — the preview is still untrusted, sandboxed HTML; only
 * `frame-ancestors` is relaxed (to the app origin, not '*').
 */
export function buildPreviewCsp(allowlist: string = cdnAllowlist()): string {
  const cdn = allowlist ? ` ${allowlist}` : "";
  const appOrigin = process.env.APP_ORIGIN ?? "'self'";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'self'${cdn}`,
    `style-src 'unsafe-inline' 'self'${cdn}`,
    `img-src 'self' data: blob:${cdn}`,
    `font-src 'self' data:${cdn}`,
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    // Opaque-origin isolation on direct top-level navigation too (see artifact
    // CSP). `allow-scripts` only — no `allow-same-origin`.
    "sandbox allow-scripts",
    `frame-ancestors ${appOrigin}`,
    "base-uri 'none'",
  ].join("; ");
}

export function buildShellCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * APP-ORIGIN CSP (app-origin-csp): the trusted creator console + auth pages.
 * Deny-by-default; `script-src` keeps `'unsafe-inline'` because Next.js
 * injects inline bootstrap/flight scripts (nonce-based hardening is the
 * documented follow-up, as for the shell CSP). `frame-src` allows ONLY the
 * viewer origin — the in-console preview iframe loads from there. Dev adds
 * `'unsafe-eval'` (Next dev tooling) and `ws:` (HMR); prod strings are static.
 */
export function buildAppCsp(opts?: {
  viewerOrigin?: string;
  dev?: boolean;
}): string {
  const viewerOrigin = opts?.viewerOrigin ?? process.env.VIEWER_ORIGIN;
  const dev = opts?.dev ?? process.env.NODE_ENV !== "production";
  return [
    "default-src 'none'",
    dev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    dev ? "connect-src 'self' ws:" : "connect-src 'self'",
    `frame-src ${viewerOrigin || "'self'"}`,
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
}
