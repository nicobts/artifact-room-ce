import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import { promoteAdmins } from "@/db/promote-admins";

function freshDb() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./db/migrations" });
  return { sqlite, db };
}

function addUser(sqlite: ReturnType<typeof createSqlite>, email: string) {
  sqlite
    .prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
    .run(randomUUID(), email, email);
}

function roleOf(sqlite: ReturnType<typeof createSqlite>, email: string) {
  return (
    sqlite.prepare("SELECT role FROM user WHERE email = ?").get(email) as {
      role: string;
    }
  ).role;
}

describe("promoteAdmins (boot bootstrap)", () => {
  it("promotes matching users case-insensitively; leaves others alone", () => {
    const { sqlite, db } = freshDb();
    addUser(sqlite, "Owner@Acme.com");
    addUser(sqlite, "member@acme.com");

    const n = promoteAdmins(db, ["owner@acme.com"]);

    expect(n).toBe(1);
    expect(roleOf(sqlite, "Owner@Acme.com")).toBe("admin");
    expect(roleOf(sqlite, "member@acme.com")).toBe("member");
    sqlite.close();
  });

  it("is idempotent and PROMOTE-ONLY (an absent email never demotes)", () => {
    const { sqlite, db } = freshDb();
    addUser(sqlite, "owner@acme.com");
    promoteAdmins(db, ["owner@acme.com"]);

    // Second boot with the email REMOVED from the env: no demotion.
    const n = promoteAdmins(db, []);
    expect(n).toBe(0);
    expect(roleOf(sqlite, "owner@acme.com")).toBe("admin");

    // Re-running with the email present changes nothing further.
    promoteAdmins(db, ["owner@acme.com"]);
    expect(roleOf(sqlite, "owner@acme.com")).toBe("admin");
    sqlite.close();
  });

  it("no-ops with an empty list and an empty table", () => {
    const { db } = freshDb();
    expect(promoteAdmins(db, [])).toBe(0);
  });
});
