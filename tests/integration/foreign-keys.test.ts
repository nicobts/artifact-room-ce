import { describe, it, expect } from "vitest";
import { createSqlite } from "@/db/sqlite";

/**
 * Proves `PRAGMA foreign_keys = ON` is live in the dialect module. If this
 * regresses, every `.references()` in the schema becomes cosmetic and the
 * data-model invariants (e.g. event -> share) are silently unenforced.
 */
describe("SQLite dialect: foreign-key enforcement", () => {
  it("rejects a child row whose FK references a non-existent parent", () => {
    const sqlite = createSqlite(":memory:");
    sqlite.prepare("CREATE TABLE parent (id TEXT PRIMARY KEY)").run();
    sqlite
      .prepare(
        "CREATE TABLE leaf (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))",
      )
      .run();

    const insertBad = () =>
      sqlite
        .prepare("INSERT INTO leaf (id, parent_id) VALUES (?, ?)")
        .run("c1", "does-not-exist");

    expect(insertBad).toThrowError(/FOREIGN KEY/i);
    sqlite.close();
  });
});
