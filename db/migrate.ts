import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./client";

/**
 * Applies pending Drizzle migrations, then closes the handle.
 * Run on container boot and via `npm run db:migrate`.
 *
 * No migrations exist until `core-schema` generates the first one, so this is
 * a no-op (and exits cleanly) until then.
 */
const folder = "./db/migrations";

if (!existsSync(folder)) {
  console.log(`[migrate] no migrations folder yet (${folder}) — nothing to apply.`);
  sqlite.close();
  process.exit(0);
}

migrate(db, { migrationsFolder: folder });
sqlite.close();
console.log("[migrate] migrations applied.");
