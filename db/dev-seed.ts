import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/auth-schema";
import { parseAdminEmails, promoteAdmins } from "@/db/promote-admins";
import { logger } from "@/lib/log";

type SeedEnv = Partial<
  Record<
    | "NODE_ENV"
    | "DEV_SEED_EMAIL"
    | "DEV_SEED_PASSWORD"
    | "DEV_SEED_NAME"
    | "ADMIN_EMAILS",
    string
  >
>;

/**
 * Boot-time test credentials (DEV ONLY). When `DEV_SEED_EMAIL` and
 * `DEV_SEED_PASSWORD` are set, creates that account at boot if it does not
 * exist — through the regular BetterAuth signup path, so the password is
 * hashed normally and the SIGNUP_MODE gate still applies. Idempotent; a
 * seed email listed in ADMIN_EMAILS is promoted in the same boot. Hard
 * no-op in production builds — this is a development convenience, never a
 * provisioning mechanism.
 */
export async function seedDevUser(
  env: SeedEnv = process.env as SeedEnv,
): Promise<void> {
  if ((env.NODE_ENV ?? process.env.NODE_ENV) === "production") return;

  const email = env.DEV_SEED_EMAIL?.trim().toLowerCase();
  const password = env.DEV_SEED_PASSWORD;
  if (!email || !password) return;
  if (password.length < 8) {
    logger.warn("[seed] DEV_SEED_PASSWORD must be at least 8 characters; skipping.");
    return;
  }

  try {
    const existing = db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .get();

    if (!existing) {
      const { auth } = await import("@/lib/auth");
      await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: env.DEV_SEED_NAME?.trim() || "Test User",
        },
      });
      logger.info(`[seed] created dev test user ${email}.`);
    }

    // Same-boot admin promotion when the seed email is in ADMIN_EMAILS.
    promoteAdmins(db, parseAdminEmails(env.ADMIN_EMAILS));
  } catch (err) {
    // Never crash boot over a dev convenience (e.g. invite mode rejecting
    // a non-allowlisted seed email).
    logger.warn(`[seed] could not seed dev test user: ${String(err)}`);
  }
}
