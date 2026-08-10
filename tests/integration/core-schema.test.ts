import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import { generateToken } from "@/lib/share-token";

/** Fresh in-memory DB with all migrations applied (and FK enforcement on). */
function freshDb(): BetterSqlite3.Database {
  const sqlite = createSqlite(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "./db/migrations" });
  return sqlite;
}

describe("core-schema migrations", () => {
  it("apply clean on an empty database", () => {
    expect(() => freshDb()).not.toThrow();
  });

  it("event keys to share and has NO artifact_id column (the spine invariant)", () => {
    const sqlite = freshDb();
    const cols = (
      sqlite.prepare("PRAGMA table_info('event')").all() as { name: string }[]
    ).map((c) => c.name);

    expect(cols).toContain("share_id");
    expect(cols).not.toContain("artifact_id");
    sqlite.close();
  });
});

describe("core-schema foreign keys", () => {
  it("rejects an event whose share_id does not exist", () => {
    const sqlite = freshDb();
    const insertBad = () =>
      sqlite
        .prepare("INSERT INTO event (id, share_id, type) VALUES (?, ?, ?)")
        .run(randomUUID(), "no-such-share", "view");

    expect(insertBad).toThrowError(/FOREIGN KEY/i);
    sqlite.close();
  });

  it("accepts a valid artifact -> share -> viewer_session -> event chain", () => {
    const sqlite = freshDb();
    const artifactId = randomUUID();
    const shareId = randomUUID();
    const sessionId = randomUUID();

    sqlite
      .prepare(
        "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
      )
      .run(artifactId, "creator-1", "Deck", "blob-key-1", "text/html");
    sqlite
      .prepare(
        "INSERT INTO share (id, artifact_id, token, mode) VALUES (?, ?, ?, ?)",
      )
      .run(shareId, artifactId, generateToken(), "recipient");
    sqlite
      .prepare(
        "INSERT INTO viewer_session (id, share_id, client_id) VALUES (?, ?, ?)",
      )
      .run(sessionId, shareId, "client-abc");
    sqlite
      .prepare(
        "INSERT INTO event (id, share_id, viewer_session_id, type, slide_index) VALUES (?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), shareId, sessionId, "slide_view", 2);

    const count = sqlite
      .prepare("SELECT COUNT(*) AS n FROM event WHERE share_id = ?")
      .get(shareId) as { n: number };
    expect(count.n).toBe(1);
    sqlite.close();
  });

  it("enforces share.token uniqueness", () => {
    const sqlite = freshDb();
    const artifactId = randomUUID();
    sqlite
      .prepare(
        "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
      )
      .run(artifactId, "creator-1", "Deck", "blob-key-1", "text/html");

    const token = generateToken();
    const insertShare = (id: string) =>
      sqlite
        .prepare(
          "INSERT INTO share (id, artifact_id, token, mode) VALUES (?, ?, ?, ?)",
        )
        .run(id, artifactId, token, "public");

    insertShare(randomUUID());
    expect(() => insertShare(randomUUID())).toThrowError(/UNIQUE/i);
    sqlite.close();
  });
});
