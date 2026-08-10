import "server-only";
import { readdirSync } from "node:fs";
import { sqlite } from "@/db/client";
import { getStorage } from "@/lib/storage";

/**
 * Readiness checks (consumed by /readyz). Returns not-ready while the DB is
 * unreachable, migrations are behind, or storage is unwritable — so a rolling
 * deploy doesn't route traffic before the container is actually serviceable.
 * Each check is injectable for testing.
 */
export interface ReadinessChecks {
  db: boolean;
  migrations: boolean;
  storage: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessChecks;
}

export interface ReadinessDeps {
  pingDb(): boolean;
  migrationsAtHead(): boolean;
  storageWritable(): Promise<boolean>;
}

function realPingDb(): boolean {
  sqlite.prepare("SELECT 1").get();
  return true;
}

function realMigrationsAtHead(): boolean {
  const files = readdirSync("./db/migrations").filter((f) => f.endsWith(".sql"));
  const applied = sqlite
    .prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations")
    .get() as { n: number };
  return files.length > 0 && applied.n >= files.length;
}

async function realStorageWritable(): Promise<boolean> {
  const storage = await getStorage();
  const key = "__readyz__";
  await storage.put(key, Buffer.from("ok"), "text/plain");
  const got = await storage.get(key);
  await storage.delete(key);
  return got?.data.toString() === "ok";
}

export async function checkReadiness(
  overrides: Partial<ReadinessDeps> = {},
): Promise<ReadinessResult> {
  const pingDb = overrides.pingDb ?? realPingDb;
  const migrationsAtHead = overrides.migrationsAtHead ?? realMigrationsAtHead;
  const storageWritable = overrides.storageWritable ?? realStorageWritable;

  const checks: ReadinessChecks = { db: false, migrations: false, storage: false };
  try {
    checks.db = pingDb();
  } catch {
    /* not ready */
  }
  try {
    checks.migrations = migrationsAtHead();
  } catch {
    /* not ready */
  }
  try {
    checks.storage = await storageWritable();
  } catch {
    /* not ready */
  }

  return { ready: checks.db && checks.migrations && checks.storage, checks };
}
