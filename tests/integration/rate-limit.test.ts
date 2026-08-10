import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import { checkRateLimit } from "@/lib/rate-limit";

function freshSqlite() {
  const sqlite = createSqlite(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "./db/migrations" });
  return sqlite;
}

describe("checkRateLimit (fixed window)", () => {
  it("allows up to the limit then blocks, and resets after the window", () => {
    const sqlite = freshSqlite();
    const opts = { limit: 2, windowMs: 1000 };
    const t0 = 1_000_000;

    expect(checkRateLimit(sqlite, "k", opts, t0).allowed).toBe(true); // 1
    expect(checkRateLimit(sqlite, "k", opts, t0 + 10).allowed).toBe(true); // 2
    const third = checkRateLimit(sqlite, "k", opts, t0 + 20);
    expect(third.allowed).toBe(false); // 3 -> blocked
    expect(third.remaining).toBe(0);

    // After the window, the counter resets.
    expect(checkRateLimit(sqlite, "k", opts, t0 + 1001).allowed).toBe(true);
    sqlite.close();
  });

  it("tracks keys independently", () => {
    const sqlite = freshSqlite();
    const opts = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit(sqlite, "a", opts, 0).allowed).toBe(true);
    expect(checkRateLimit(sqlite, "b", opts, 0).allowed).toBe(true);
    expect(checkRateLimit(sqlite, "a", opts, 0).allowed).toBe(false);
    sqlite.close();
  });
});
