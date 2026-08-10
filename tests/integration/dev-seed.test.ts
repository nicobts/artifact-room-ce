import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";

/**
 * dev-seed: boot-time test credentials from env (DEV ONLY). Creates the
 * account when missing, is idempotent, honors ADMIN_EMAILS promotion in the
 * same boot, and hard-no-ops in production.
 */

let seedDevUser: typeof import("@/db/dev-seed").seedDevUser;
let dbPath: string;

function userRow(email: string) {
  const sqlite = createSqlite(dbPath);
  const row = sqlite
    .prepare("SELECT email, role FROM user WHERE email = ?")
    .get(email) as { email: string; role: string } | undefined;
  sqlite.close();
  return row;
}

function userCount(email: string): number {
  const sqlite = createSqlite(dbPath);
  const n = (
    sqlite.prepare("SELECT COUNT(*) AS n FROM user WHERE email = ?").get(email) as {
      n: number;
    }
  ).n;
  sqlite.close();
  return n;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ar-dev-seed-"));
  dbPath = join(dir, "test.sqlite");
  const seed = createSqlite(dbPath);
  migrate(drizzle(seed), { migrationsFolder: "./db/migrations" });
  seed.close();

  process.env.DATABASE_PATH = dbPath;
  process.env.BETTER_AUTH_SECRET = "test-secret-0000000000000000000000000000";
  process.env.APP_ORIGIN = "http://app.localhost:3000";
  process.env.SIGNUP_MODE = "open";

  ({ seedDevUser } = await import("@/db/dev-seed"));
});

describe("seedDevUser", () => {
  it("creates the test user with role member", async () => {
    await seedDevUser({
      DEV_SEED_EMAIL: "tester@dev.example",
      DEV_SEED_PASSWORD: "supersecret1",
      DEV_SEED_NAME: "Dev Tester",
    });
    expect(userRow("tester@dev.example")).toEqual({
      email: "tester@dev.example",
      role: "member",
    });
  });

  it("is idempotent — a second boot does not duplicate or fail", async () => {
    await seedDevUser({
      DEV_SEED_EMAIL: "tester@dev.example",
      DEV_SEED_PASSWORD: "supersecret1",
    });
    expect(userCount("tester@dev.example")).toBe(1);
  });

  it("promotes the seeded user when listed in ADMIN_EMAILS (same boot)", async () => {
    await seedDevUser({
      DEV_SEED_EMAIL: "boss@dev.example",
      DEV_SEED_PASSWORD: "supersecret1",
      ADMIN_EMAILS: "boss@dev.example",
    });
    expect(userRow("boss@dev.example")?.role).toBe("admin");
  });

  it("hard-no-ops in production", async () => {
    await seedDevUser({
      NODE_ENV: "production",
      DEV_SEED_EMAIL: "prod@dev.example",
      DEV_SEED_PASSWORD: "supersecret1",
    });
    expect(userRow("prod@dev.example")).toBeUndefined();
  });

  it("no-ops when the variables are unset or the password is too short", async () => {
    await seedDevUser({});
    await seedDevUser({
      DEV_SEED_EMAIL: "short@dev.example",
      DEV_SEED_PASSWORD: "short",
    });
    expect(userRow("short@dev.example")).toBeUndefined();
  });
});
