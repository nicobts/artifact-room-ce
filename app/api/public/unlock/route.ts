import { NextResponse } from "next/server";
import { resolveShare } from "@/lib/share";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { accessCookieName, signAccess } from "@/lib/viewer-access";

const WINDOW_MS = 15 * 60 * 1000;
const PER_TOKEN = 5;
const PER_IP = 30;

/**
 * ONE response for every failure. Wrong password, wrong address, unknown token,
 * revoked, expired, malformed body, and throttled are all indistinguishable —
 * anything finer turns this endpoint into an oracle for which tokens exist and
 * which addresses are registered. Do NOT add a reason field "just for
 * debugging": that field is the vulnerability.
 */
function denied() {
  return NextResponse.json({ ok: false }, { status: 401 });
}

/**
 * Verify a share's gate (email, password, or both) and, on success, set an
 * httpOnly host-only access cookie on the viewer origin — so the raw endpoint
 * accepts subsequent frame loads without re-sending the credentials.
 *
 * Rate-limited per token (stops grinding one share) and per IP (stops sweeping
 * many shares from one host). Both limiters count every attempt, successes
 * included; a legitimate viewer unlocks once and then holds the cookie.
 */
export async function POST(req: Request) {
  let token = "";
  let email: string | undefined;
  let password: string | undefined;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.token === "string") token = body.token;
    if (typeof body.email === "string") email = body.email;
    if (typeof body.password === "string") password = body.password;
  } catch {
    return denied();
  }
  if (!token) return denied();

  // Both limiters are evaluated BEFORE any credential work, so a throttled
  // request performs no scrypt hashing — otherwise response time alone would
  // distinguish "throttled" from "wrong password".
  const ip = clientIp(req);
  const ipRl = checkRateLimit(sqlite, `unlock:ip:${ip}`, {
    limit: PER_IP,
    windowMs: WINDOW_MS,
  });
  const tokenRl = checkRateLimit(sqlite, `unlock:token:${token}`, {
    limit: PER_TOKEN,
    windowMs: WINDOW_MS,
  });
  if (!ipRl.allowed || !tokenRl.allowed) return denied();

  const r = resolveShare(token, { email, password });
  if (r.status !== "ok") return denied();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(accessCookieName(r.share.id), signAccess(r.share.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
