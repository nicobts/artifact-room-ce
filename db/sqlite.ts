import Database from "better-sqlite3";

/**
 * Dialect-isolated module. ALL SQLite-only setup lives here so the Postgres
 * swap is localized (portability discipline — docs/adr/0001-database-and-storage-targets.md).
 *
 * These pragmas are applied to every connection. SQLite enforces NONE of them
 * by default:
 *   - foreign_keys = ON   → without this, every `.references()` is cosmetic and
 *                            the "an event cannot exist without a valid share"
 *                            invariant is unenforced. Launch-blocking.
 *   - journal_mode = WAL  → concurrent readers alongside the single writer.
 *   - busy_timeout        → serialize writers gracefully (one writable container).
 *   - synchronous = NORMAL→ safe under WAL, materially faster than FULL.
 */
export function createSqlite(path: string): Database.Database {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}
