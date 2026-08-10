import { sql, inArray, and, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { user } from "@/db/auth-schema";

/**
 * `ADMIN_EMAILS` bootstrap (admin-role-column): a PROMOTE-ONLY recovery hatch
 * applied at boot, after migrations. Any existing user whose email matches an
 * entry (case-insensitive) is promoted to role='admin'. Removing an entry
 * never demotes — demotion is an admin-UI action. Lockout recovery: add your
 * email here and restart the container.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function promoteAdmins(
  database: BetterSQLite3Database<Record<string, unknown>>,
  emails: string[],
): number {
  if (emails.length === 0) return 0;
  const result = database
    .update(user)
    .set({ role: "admin" })
    .where(and(inArray(sql`lower(${user.email})`, emails), ne(user.role, "admin")))
    .run();
  return result.changes;
}
