import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health";

/**
 * Readiness probe (app origin only — blocked on the viewer origin by proxy.ts).
 * 503 until the DB is reachable, migrations are at head, and storage is writable.
 */
export async function GET() {
  const result = await checkReadiness();
  return NextResponse.json(result, { status: result.ready ? 200 : 503 });
}
