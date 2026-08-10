import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";

let users: typeof import("@/lib/users");
let dbPath: string;

let clock = 1_700_000_000_000; // explicit created_at: the default is second-precision, which would tie

function addUser(email: string, role = "member"): string {
  const id = randomUUID();
  const sqlite = createSqlite(dbPath);
  sqlite
    .prepare(
      "INSERT INTO user (id, name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, email, email, role, ++clock, clock);
  sqlite.close();
  return id;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ar-users-"));
  dbPath = join(dir, "test.sqlite");
  const seed = createSqlite(dbPath);
  migrate(drizzle(seed), { migrationsFolder: "./db/migrations" });
  seed.close();
  process.env.DATABASE_PATH = dbPath;
  users = await import("@/lib/users");
});

describe("listUsers / setUserRole", () => {
  it("lists users with their roles, oldest first", () => {
    const idA = addUser("a@t.example", "admin");
    const idB = addUser("b@t.example");
    const rows = users.listUsers();
    const ids = rows.map((r) => r.id);
    expect(ids.indexOf(idA)).toBeLessThan(ids.indexOf(idB));
    expect(rows.find((r) => r.id === idA)?.role).toBe("admin");
    expect(rows.find((r) => r.id === idB)?.role).toBe("member");
  });

  it("promotes and demotes round-trip", () => {
    const id = addUser("c@t.example");
    expect(users.setUserRole(id, "admin")).toBe("ok");
    expect(users.listUsers().find((r) => r.id === id)?.role).toBe("admin");
    expect(users.setUserRole(id, "member")).toBe("ok");
    expect(users.listUsers().find((r) => r.id === id)?.role).toBe("member");
  });

  it("returns not-found for an unknown id", () => {
    expect(users.setUserRole(randomUUID(), "admin")).toBe("not-found");
  });

  it("refuses to demote the last admin", () => {
    // Demote every admin except one, then try to demote the survivor.
    for (const r of users.listUsers().filter((u) => u.role === "admin").slice(1)) {
      users.setUserRole(r.id, "member");
    }
    const last = users.listUsers().find((u) => u.role === "admin")!;
    expect(users.setUserRole(last.id, "member")).toBe("last-admin");
    expect(users.listUsers().find((u) => u.id === last.id)?.role).toBe("admin");
  });
});
