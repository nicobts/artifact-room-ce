import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { artifact, share, viewerSession, event } from "@/db/schema";
import { getArtifact, createArtifact } from "@/lib/artifacts";
import { getArtifactStats } from "@/lib/analytics/queries";
import type { StorageAdapter } from "@/lib/storage";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function freshDb(): Db {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  return db;
}

function addArtifact(db: Db, ownerId: string, title: string): string {
  const id = randomUUID();
  db.insert(artifact)
    .values({ id, ownerId, title, storageKey: `k_${id}`, contentType: "text/html" })
    .run();
  return id;
}
function addShare(db: Db, artifactId: string, mode = "public", recipientLabel?: string): string {
  const id = randomUUID();
  db.insert(share)
    .values({ id, artifactId, token: `tok_${id}`, mode: mode as "public" | "recipient", recipientLabel })
    .run();
  return id;
}
function addSession(db: Db, shareId: string, clientId: string): void {
  db.insert(viewerSession).values({ id: randomUUID(), shareId, clientId }).run();
}
function addEvent(db: Db, shareId: string, type: typeof event.$inferInsert.type, extra: Partial<typeof event.$inferInsert> = {}): void {
  db.insert(event).values({ id: randomUUID(), shareId, type, ...extra }).run();
}

const A = "owner-A";
const B = "owner-B";

describe("getArtifact", () => {
  it("is owner-scoped and excludes deleted", () => {
    const db = freshDb();
    const mine = addArtifact(db, A, "Mine");
    addArtifact(db, B, "Theirs");
    expect(getArtifact(A, mine, { db })?.title).toBe("Mine");
    expect(getArtifact(B, mine, { db })).toBeNull();
    db.update(artifact).set({ deletedAt: new Date() }).where(eq(artifact.id, mine)).run();
    expect(getArtifact(A, mine, { db })).toBeNull();
  });
});

describe("getArtifactStats", () => {
  let db: Db;
  let pitch: string;

  beforeEach(() => {
    db = freshDb();
    pitch = addArtifact(db, A, "Pitch");
    const s1 = addShare(db, pitch, "recipient", "Jane");
    const s2 = addShare(db, pitch, "public");
    addSession(db, s1, "c1");
    addSession(db, s2, "c2");
    // s1: 2 view, 1 reopen, dwell slide1 1000
    addEvent(db, s1, "view");
    addEvent(db, s1, "view");
    addEvent(db, s1, "reopen");
    addEvent(db, s1, "dwell", { slideIndex: 1, durationMs: 1000 });
    // s2: 1 view, 1 forward, dwell slide1 500 + slide2 700
    addEvent(db, s2, "view");
    addEvent(db, s2, "forward_suspected");
    addEvent(db, s2, "dwell", { slideIndex: 1, durationMs: 500 });
    addEvent(db, s2, "dwell", { slideIndex: 2, durationMs: 700 });

    // Another artifact of A, and an artifact of B — must be excluded.
    const other = addArtifact(db, A, "Other");
    addEvent(db, addShare(db, other, "public"), "view");
    const bArt = addArtifact(db, B, "Secret");
    addEvent(db, addShare(db, bArt, "public"), "view");
  });

  it("aggregates across the artifact's shares only", () => {
    const s = getArtifactStats(A, pitch, { db });
    expect(s.views).toBe(3); // 2 + 1 (not Other, not B)
    expect(s.reopens).toBe(1);
    expect(s.forwards).toBe(1);
    expect(s.uniqueViewers).toBe(2); // c1, c2
    expect(s.perSlideDwellMs).toEqual([
      { slideIndex: 1, totalMs: 1500 }, // 1000 + 500
      { slideIndex: 2, totalMs: 700 },
    ]);
    expect(s.recentEvents.length).toBeGreaterThan(0);
    expect(s.recentEvents.every((e) => e.artifactTitle === "Pitch")).toBe(true);
  });

  it("does not leak across owners", () => {
    expect(getArtifactStats(B, pitch, { db }).views).toBe(0); // B doesn't own Pitch
  });
});

describe("createArtifact persists metadata", () => {
  it("stores sizeBytes and scanAdvisories", async () => {
    const db = freshDb();
    const blobs = new Map<string, { data: Buffer; contentType: string }>();
    const storage: StorageAdapter = {
      put: async (k, d, ct) => {
        blobs.set(k, { data: d, contentType: ct });
      },
      get: async (k) => blobs.get(k) ?? null,
      delete: async (k) => {
        blobs.delete(k);
      },
    };
    const bytes = Buffer.from(
      "<!doctype html><html><body><h1>hi</h1></body></html>",
    );
    const res = await createArtifact(
      { ownerId: A, title: "Doc", bytes },
      { db, storage },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = db.select().from(artifact).where(eq(artifact.id, res.id)).get();
    expect(row?.sizeBytes).toBe(bytes.length);
    expect(Array.isArray(row?.scanAdvisories)).toBe(true);
  });
});
