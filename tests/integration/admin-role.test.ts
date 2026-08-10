import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";

/**
 * admin-role-column: `role` is server-set by construction. A signup request
 * that smuggles a `role` field must NOT be honored — the created user is a
 * plain `member`.
 */
describe("user.role is never client-settable", () => {
  it("ignores a role field smuggled into signup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-admin-role-"));
    const dbPath = join(dir, "test.sqlite");
    const seed = createSqlite(dbPath);
    migrate(drizzle(seed), { migrationsFolder: "./db/migrations" });
    seed.close();

    process.env.DATABASE_PATH = dbPath;
    process.env.BETTER_AUTH_SECRET =
      "test-secret-0000000000000000000000000000";
    process.env.APP_ORIGIN = "http://app.localhost:3000";
    process.env.SIGNUP_MODE = "open";

    const { auth } = await import("@/lib/auth");
    await auth.api.signUpEmail({
      body: {
        email: "mallory@acme.com",
        password: "supersecret",
        name: "Mallory",
        role: "admin", // the attack: client-supplied role
      } as unknown as { email: string; password: string; name: string },
    });

    const check = createSqlite(dbPath);
    const row = check
      .prepare("SELECT role FROM user WHERE email = ?")
      .get("mallory@acme.com") as { role: string } | undefined;
    check.close();
    expect(row?.role).toBe("member");
  });
});
