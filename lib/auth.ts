import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db } from "@/db/client";
import { user, session, account, verification } from "@/db/auth-schema";
import { isSignupAllowed } from "@/lib/signup-gate";

/**
 * Creator identity system — BetterAuth. CREATORS ONLY, never viewers.
 * Nothing under `app/(viewer)` may import this module.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  for (const v of [process.env.APP_ORIGIN, process.env.BETTER_AUTH_URL]) {
    if (v) origins.add(v);
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://app.localhost:3000");
  }
  return [...origins];
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_ORIGIN,
  trustedOrigins: trustedOrigins(),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  user: {
    additionalFields: {
      // Server-set authorization role. `input: false` ⇒ BetterAuth refuses any
      // client-supplied value on signup/update; only boot promotion
      // (db/promote-admins.ts) and the admin users API write it.
      role: {
        type: "string",
        defaultValue: "member",
        input: false,
      },
    },
  },

  advanced: {
    // Force the Secure attribute on the creator session cookie in production,
    // independent of the request scheme (a TLS-terminating proxy may forward
    // plain HTTP to the container).
    useSecureCookies: process.env.NODE_ENV === "production",
    // Privacy invariant: never persist a raw IP. (Viewer analytics are
    // cookieless by design; creator sessions also avoid IP at rest.)
    ipAddress: { disableIpTracking: true },
    // Cookies are left HOST-ONLY on purpose — we do NOT enable
    // crossSubDomainCookies, so the viewer origin can never receive a creator
    // session. This is the structural half of "two identity systems never
    // conflated".
  },

  databaseHooks: {
    user: {
      create: {
        // SIGNUP_MODE gate: in `invite` mode, reject non-allowlisted emails.
        before: async (newUser) => {
          if (!isSignupAllowed(newUser.email)) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-ups are invite-only on this instance.",
            });
          }
          return { data: newUser };
        },
      },
    },
  },
});
