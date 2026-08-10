import { NextResponse } from "next/server";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { createAbuseReport } from "@/lib/abuse";

const HOUR = 60 * 60 * 1000;

/**
 * Public abuse reporting (no account). Rate-limited per IP. Stores the report
 * and returns a GENERIC acknowledgement regardless of whether the token exists
 * (no enumeration).
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(sqlite, `abuse-report:ip:${ip}`, {
    limit: 10,
    windowMs: HOUR,
  });
  if (!rl.allowed) {
    return NextResponse.json({ ok: true }); // generic even when throttled
  }

  let body: { token?: unknown; reason?: unknown; details?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through to generic ack */
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : "unspecified";
  const reportedToken =
    typeof body.token === "string" ? body.token.slice(0, 200) : null;
  const details =
    typeof body.details === "string" ? body.details.slice(0, 2000) : null;

  createAbuseReport({ reportedToken, reason, details });
  return NextResponse.json({ ok: true });
}
