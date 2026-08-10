import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { event } from "@/db/schema";
import { createShare } from "@/lib/share";
import { recordBeacon, type EventSink } from "@/lib/analytics/beacon";
import { getShareStats } from "@/lib/analytics/queries";
import {
  resolveOrCreateViewerSession,
  REOPEN_GAP_MS,
} from "@/lib/analytics/session";

function setup() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  const artifactId = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
    )
    .run(artifactId, "c1", "Deck", "k", "text/html");
  return { db, sqlite, artifactId };
}

// Synchronous sink so assertions see events immediately (bypasses the buffer).
const sink: EventSink = (rows, db) => {
  db.insert(event).values(rows).run();
};

describe("recordBeacon attribution", () => {
  it("writes events keyed to shareId; event has no artifact column", async () => {
    const { db, sqlite, artifactId } = setup();
    const s = await createShare(
      { ownerId: "c1", artifactId, protection: "public" },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    recordBeacon(
      {
        token: s.token,
        clientId: "cid-1",
        serverSignalHash: "h1",
        events: [{ type: "view" }, { type: "dwell", slideIndex: 0, durationMs: 3000 }],
      },
      { db, sink },
    );

    const rows = sqlite.prepare("SELECT type, share_id FROM event").all() as {
      type: string;
      share_id: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.share_id === s.id)).toBe(true);

    const cols = (
      sqlite.prepare("PRAGMA table_info('event')").all() as { name: string }[]
    ).map((c) => c.name);
    expect(cols).not.toContain("artifact_id");
  });

  it("ignores an unusable (unknown) token", () => {
    const { db } = setup();
    const res = recordBeacon(
      { token: "nope", clientId: "x", serverSignalHash: "h", events: [{ type: "view" }] },
      { db, sink },
    );
    expect(res).toMatchObject({ ok: false, written: 0 });
  });

  it("flags forwarding when a new clientId opens the same token", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      { ownerId: "c1", artifactId, protection: "public" },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    recordBeacon(
      { token: s.token, clientId: "cid-A", serverSignalHash: "hA", events: [{ type: "view" }] },
      { db, sink },
    );
    recordBeacon(
      { token: s.token, clientId: "cid-B", serverSignalHash: "hB", events: [{ type: "view" }] },
      { db, sink },
    );

    const stats = getShareStats(s.id, { db });
    expect(stats.uniqueViewers).toBe(2);
    expect(stats.views).toBe(2);
    expect(stats.forwards).toBe(1); // cid-B is the forward
  });

  it("aggregates per-slide dwell", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      { ownerId: "c1", artifactId, protection: "public" },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    recordBeacon(
      {
        token: s.token,
        clientId: "cid-1",
        serverSignalHash: "h",
        events: [
          { type: "dwell", slideIndex: 0, durationMs: 1000 },
          { type: "dwell", slideIndex: 0, durationMs: 2000 },
          { type: "dwell", slideIndex: 1, durationMs: 500 },
        ],
      },
      { db, sink },
    );

    const stats = getShareStats(s.id, { db });
    expect(stats.perSlideDwellMs.find((d) => d.slideIndex === 0)?.totalMs).toBe(3000);
    expect(stats.perSlideDwellMs.find((d) => d.slideIndex === 1)?.totalMs).toBe(500);
  });
});

describe("reopen detection", () => {
  it("flags a returning clientId after the gap", () => {
    const { db, sqlite, artifactId } = setup();
    const shareId = randomUUID();
    sqlite
      .prepare("INSERT INTO share (id, artifact_id, token, mode) VALUES (?, ?, ?, ?)")
      .run(shareId, artifactId, "tok", "recipient");

    const t0 = 1_000_000;
    const first = resolveOrCreateViewerSession(db, shareId, "cid-1", "h", t0);
    expect(first.isNew).toBe(true);
    expect(first.isReopen).toBe(false);

    const again = resolveOrCreateViewerSession(
      db,
      shareId,
      "cid-1",
      "h",
      t0 + REOPEN_GAP_MS + 1,
    );
    expect(again.isReopen).toBe(true);
    expect(again.isForward).toBe(false);
  });
});
