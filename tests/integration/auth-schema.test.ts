import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";

function freshDb(): BetterSqlite3.Database {
  const sqlite = createSqlite(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "./db/migrations" });
  return sqlite;
}

describe("creator-auth schema (BetterAuth tables)", () => {
  it("creates user, session, account, verification tables", () => {
    const sqlite = freshDb();
    const tables = (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((t) => t.name);

    for (const t of ["user", "session", "account", "verification"]) {
      expect(tables).toContain(t);
    }
    sqlite.close();
  });

  it("enforces the session.user_id foreign key", () => {
    const sqlite = freshDb();
    const insertBad = () =>
      sqlite
        .prepare(
          "INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, ?)",
        )
        .run(randomUUID(), Date.now() + 1000, "tok-bad", "no-such-user");

    expect(insertBad).toThrowError(/FOREIGN KEY/i);
    sqlite.close();
  });

  it("accepts a session for a real user", () => {
    const sqlite = freshDb();
    const userId = randomUUID();
    sqlite
      .prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
      .run(userId, "Jane", "jane@acme.com");
    sqlite
      .prepare(
        "INSERT INTO session (id, expires_at, token, user_id) VALUES (?, ?, ?, ?)",
      )
      .run(randomUUID(), Date.now() + 1000, "tok-1", userId);

    const n = sqlite
      .prepare("SELECT COUNT(*) AS n FROM session WHERE user_id = ?")
      .get(userId) as { n: number };
    expect(n.n).toBe(1);
    sqlite.close();
  });

  it("user.role defaults to 'member' and is NOT NULL", () => {
    const sqlite = freshDb();
    sqlite
      .prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
      .run(randomUUID(), "Jane", "jane@roles.example");
    const row = sqlite
      .prepare("SELECT role FROM user WHERE email = ?")
      .get("jane@roles.example") as { role: string };
    expect(row.role).toBe("member");

    const col = (
      sqlite.prepare("PRAGMA table_info(user)").all() as {
        name: string;
        notnull: number;
      }[]
    ).find((c) => c.name === "role");
    expect(col?.notnull).toBe(1);
    sqlite.close();
  });
});
