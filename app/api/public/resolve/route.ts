import { NextResponse } from "next/server";
import { sqlite } from "@/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { resolveShare } from "@/lib/share";

const MINUTE = 60 * 1000;

/**
 * Public, accountless token resolution (consumed by the viewer shell in
 * viewer-render-sandbox). Rate-limited per IP (IP transient). Failures return a
 * typed status with NO artifact detail (resists enumeration). No caching.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(sqlite, `resolve:ip:${ip}`, {
    limit: 120,
    windowMs: MINUTE,
  });
  if (!rl.allowed) {
    return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  }

  let token = "";
  let email: string | undefined;
  let password: string | undefined;
  try {
    const body = (await req.json()) as {
      token?: unknown;
      email?: unknown;
      password?: unknown;
    };
    if (typeof body.token === "string") token = body.token;
    if (typeof body.email === "string") email = body.email;
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ status: "denied" });
  }

  const result = resolveShare(token, { email, password });
  if (result.status === "ok") {
    return NextResponse.json({
      status: "ok",
      share: {
        id: result.share.id,
        mode: result.share.mode,
        recipientLabel: result.share.recipientLabel,
      },
      artifact: {
        id: result.artifact.id,
        title: result.artifact.title,
        slideCount: result.artifact.slideCount,
      },
    });
  }

  // One generic failure. Echoing `result.status` here previously defeated this
  // route's own anti-enumeration claim: it distinguished "token exists, wrong
  // password" from "no such token". `gate` and `denied` both collapse to
  // `denied` for the caller.
  return NextResponse.json({ status: "denied" });
}
