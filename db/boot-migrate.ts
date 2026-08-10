import "server-only";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/db/client";
import { logger } from "@/lib/log";
import { parseAdminEmails, promoteAdmins } from "@/db/promote-admins";

/**
 * Apply pending Drizzle migrations against the app's singleton SQLite handle at
 * server startup (called from `instrumentation.ts`). Uses the shared `db` and
 * does NOT close it — the running server keeps serving on the same connection.
 *
 * Idempotent and guarded so it runs at most once per process. Single writable
 * container ⇒ no migration-races to coordinate. A failed
 * migration throws and aborts boot (fail-closed) — correct for a single-writer
 * schema.
 */
const folder = "./db/migrations";
let applied = false;

export function runMigrations(): void {
  if (applied) return;
  applied = true;
  if (!existsSync(folder)) {
    logger.warn(`[migrate] no migrations folder (${folder}); nothing to apply.`);
    return;
  }
  migrate(db, { migrationsFolder: folder });
  const promoted = promoteAdmins(db, parseAdminEmails(process.env.ADMIN_EMAILS));
  if (promoted > 0) {
    logger.info(`[boot] promoted ${promoted} user(s) to admin via ADMIN_EMAILS.`);
  }
  logger.info("[migrate] migrations applied at boot.");
}
