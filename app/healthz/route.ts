import { NextResponse } from "next/server";

/**
 * Liveness probe (app origin). Cheap, dependency-free — the process is up.
 * Readiness (`/readyz`: DB reachable + migrations at head + storage writable)
 * lands in the `ops-hardening` change.
 */
export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
