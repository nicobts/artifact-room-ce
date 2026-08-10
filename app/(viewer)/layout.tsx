/**
 * Viewer route group — served ONLY on the viewer origin (see middleware.ts).
 *
 * Deliberately minimal: no shadcn weight, no marketing components, no creator
 * session helpers, no provider branding. The artifact is the content; this
 * shell is a thin, secure host. The sandboxed-iframe renderer and strict CSP
 * land in the `viewer-render-sandbox` change.
 */
export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
