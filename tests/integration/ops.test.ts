import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { enqueueEvents, flushEvents, bufferSize } from "@/lib/analytics/buffer";
import { runShutdown } from "@/lib/shutdown";

const dir = mkdtempSync(join(tmpdir(), "artifact-room-ops-"));
afterEach(() => {
  // keep the global buffer clean between tests
  flushEvents();
});

function setup() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  const artifactId = randomUUID();
  const shareId = randomUUID();
  const sessionId = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
    )
    .run(artifactId, "c1", "Deck", "k", "text/html");
  sqlite
    .prepare("INSERT INTO share (id, artifact_id, token, mode) VALUES (?, ?, ?, ?)")
    .run(shareId, artifactId, "tok", "public");
  sqlite
    .prepare("INSERT INTO viewer_session (id, share_id, client_id) VALUES (?, ?, ?)")
    .run(sessionId, shareId, "cid");
  return { db, sqlite, shareId, sessionId };
}

describe("analytics write-behind buffer", () => {
  it("flushes enqueued events to the database", () => {
    const { db, sqlite, shareId, sessionId } = setup();
    enqueueEvents(
      [{ id: randomUUID(), shareId, viewerSessionId: sessionId, type: "view" }],
      db,
    );
    expect(bufferSize()).toBeGreaterThan(0);

    expect(flushEvents(db)).toBeGreaterThan(0);
    expect(bufferSize()).toBe(0);

    const count = sqlite
      .prepare("SELECT COUNT(*) AS n FROM event WHERE share_id = ?")
      .get(shareId) as { n: number };
    expect(count.n).toBe(1);
  });
});

describe("graceful shutdown", () => {
  it("flushes the buffer and closes the database", () => {
    let flushed = false;
    let closed = false;
    runShutdown({
      flush: () => {
        flushed = true;
      },
      checkpointAndClose: () => {
        closed = true;
      },
    });
    expect(flushed).toBe(true);
    expect(closed).toBe(true);
  });
});

describe("consistent snapshot", () => {
  it("an online backup opens clean and contains the data", async () => {
    const { sqlite, shareId } = setup();
    const snapshot = join(dir, `snap-${randomUUID()}.sqlite`);

    // better-sqlite3's .backup uses SQLite's online backup API (NOT a raw copy).
    await sqlite.backup(snapshot);

    const restored = new Database(snapshot, { readonly: true });
    const n = restored
      .prepare("SELECT COUNT(*) AS n FROM share WHERE id = ?")
      .get(shareId) as { n: number };
    expect(n.n).toBe(1);
    restored.close();
    rmSync(snapshot, { force: true });
  });
});
