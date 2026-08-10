import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Server-side session chokepoint for the CREATOR system.
 *
 * `import "server-only"` makes this module a build error if it is ever imported
 * into a Client Component or the viewer bundle — a hard fence reinforcing
 * "two identity systems never conflated". Always validate sessions on the
 * server; never trust a client-only check.
 */
export async function getCreatorSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Require a creator session or redirect to sign-in. The `(creator)` chokepoint. */
export async function requireCreator() {
  const session = await getCreatorSession();
  if (!session) redirect("/login");
  return session;
}
