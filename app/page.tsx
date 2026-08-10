import { redirect } from "next/navigation";
import { getCreatorSession } from "@/lib/session";

/**
 * The marketing landing lives in its own repository and deployment
 * (artifact-room.com) — the app origin's root is just an entry point:
 * straight to the console when a creator session exists, otherwise to
 * sign-in. Imports only the creator identity system; the viewer origin
 * never serves this route (proxy.ts 404s non-viewer paths there).
 */
export default async function Home() {
  const session = await getCreatorSession();
  redirect(session ? "/dashboard" : "/login");
}
