import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { event } from "@/db/schema";
import { createShare } from "@/lib/share";
import { recordBeacon, type EventSink } from "@/lib/analytics/beacon";
import { getShareCoverage, getShareDetection } from "@/lib/analytics/queries";

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

describe("region detection + coverage queries", () => {
  it("computes coverage from distinct slide_view indexes over detection.count", async () => {
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
          {
            type: "view",
            metadata: {
              detection: {
                method: "annotated",
                kind: "sections",
                count: 4,
                labels: ["A", "B", "C", "D"],
              },
            },
          },
          { type: "slide_view", slideIndex: 0 },
          { type: "slide_view", slideIndex: 1 },
          { type: "slide_view", slideIndex: 1 }, // duplicate index — proves DISTINCT
          { type: "slide_view", slideIndex: 2 },
        ],
      },
      { db, sink },
    );

    expect(getShareDetection(s.id, { db })).toEqual({
      method: "annotated",
      kind: "sections",
      count: 4,
      labels: ["A", "B", "C", "D"],
    });
    expect(getShareCoverage(s.id, { db })).toBe(0.75);
  });

  it("returns null detection/coverage when the share has no detection metadata", async () => {
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
        events: [{ type: "view" }, { type: "slide_view", slideIndex: 0 }],
      },
      { db, sink },
    );

    expect(getShareDetection(s.id, { db })).toBeNull();
    expect(getShareCoverage(s.id, { db })).toBeNull();
  });

  it("selects the max-count detection, not the latest, when a later event has a lower count", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      { ownerId: "c1", artifactId, protection: "public" },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    // Older detection: full section ladder, count 4.
    db.insert(event)
      .values({
        id: randomUUID(),
        shareId: s.id,
        type: "view",
        metadata: {
          detection: {
            method: "annotated",
            kind: "sections",
            count: 4,
            labels: ["A", "B", "C", "D"],
          },
        },
        createdAt: new Date("2026-07-01T10:00:00Z"),
      })
      .run();

    // Newer detection: a viewport-dependent shim rung (or post-Replace stale
    // metadata) landed on a lower count — must NOT win over the older, richer one.
    db.insert(event)
      .values({
        id: randomUUID(),
        shareId: s.id,
        type: "view",
        metadata: {
          detection: { method: "fallback", kind: "document", count: 1 },
        },
        createdAt: new Date("2026-07-01T11:00:00Z"),
      })
      .run();

    recordBeacon(
      {
        token: s.token,
        clientId: "cid-1",
        serverSignalHash: "h",
        events: [
          { type: "slide_view", slideIndex: 0 },
          { type: "slide_view", slideIndex: 1 },
          { type: "slide_view", slideIndex: 2 },
        ],
      },
      { db, sink },
    );

    expect(getShareDetection(s.id, { db })).toEqual({
      method: "annotated",
      kind: "sections",
      count: 4,
      labels: ["A", "B", "C", "D"],
    });
    expect(getShareCoverage(s.id, { db })).toBe(0.75);
  });

  it("returns null coverage when detection.count is 0", async () => {
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
          {
            type: "view",
            metadata: { detection: { method: "empty", kind: "document", count: 0 } },
          },
          { type: "slide_view", slideIndex: 0 },
        ],
      },
      { db, sink },
    );

    expect(getShareCoverage(s.id, { db })).toBeNull();
  });
});
