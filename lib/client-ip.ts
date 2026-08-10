/**
 * Trusted client IP for rate-limiting keys.
 *
 * SECURITY: the leftmost `X-Forwarded-For` entries are supplied by the client
 * and MUST NOT be trusted — reading `xff.split(",")[0]` lets an attacker rotate
 * a fake IP per request and defeat every rate limit. The reverse proxy in front
 * of the container (see `devops/proxy/`) APPENDS the real client IP as the
 * RIGHTMOST XFF entry, so we read the Nth-from-right entry, where
 * N = `TRUSTED_PROXY_HOPS` (default 1 — a single reverse proxy directly in front
 * of the app).
 *
 * Operators running additional trusted proxies (e.g. Cloudflare → nginx → app)
 * set `TRUSTED_PROXY_HOPS` to the number of trusted hops. A direct, proxy-less
 * deployment is not a supported production topology (see `devops/DEPLOYMENT.md`):
 * there is then no trustworthy client IP, the value degrades to best-effort, and
 * IP-keyed rate limits are advisory only.
 *
 * The returned value is used ONLY as a transient rate-limit key; it is never
 * persisted as identity (privacy invariant).
 */
export function trustedProxyHops(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function clientIp(
  req: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  const hops = trustedProxyHops(env);
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "local";
  // Read the entry the trusted proxy layer appended: N-th from the right.
  const idx = parts.length - hops;
  return parts[idx >= 0 ? idx : 0] || "local";
}
