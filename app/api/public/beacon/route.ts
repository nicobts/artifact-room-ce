import { NextResponse } from "next/server";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { parseBeacon, recordBeacon } from "@/lib/analytics/beacon";
import { computeServerSignalHash } from "@/lib/analytics/session";

const MINUTE = 60 * 1000;

/**
 * Cookieless analytics beacon. Identity is the body `clientId` + URL token, not
 * a cookie. IP is read only transiently for rate limiting and never written.
 * Events are buffered (write-behind) and acknowledged immediately.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(sqlite, `beacon:ip:${ip}`, {
    limit: 600,
    windowMs: MINUTE,
  });
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = parseBeacon(body);
  if (!parsed) return new NextResponse(null, { status: 204 });

  const serverSignalHash = computeServerSignalHash(
    req.headers.get("user-agent") ?? "",
    req.headers.get("accept-language") ?? "",
  );

  recordBeacon({ ...parsed, serverSignalHash });
  return new NextResponse(null, { status: 202 });
}
