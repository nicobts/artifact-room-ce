import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { artifact, share, event, creatorPrefs } from "@/db/schema";
import {
  listNotifications,
  unreadCount,
  markSeen,
} from "@/lib/notifications";

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
function addShare(db: Db, artifactId: string, mode = "recipient", recipientLabel?: string): string {
  const id = randomUUID();
  db.insert(share)
    .values({
      id,
      artifactId,
      token: `tok_${id}`,
      mode: mode as "public" | "recipient",
      recipientLabel,
    })
    .run();
  return id;
}
function addEvent(
  db: Db,
  shareId: string,
  type: typeof event.$inferInsert.type,
  at: Date,
): void {
  db.insert(event)
    .values({ id: randomUUID(), shareId, type, createdAt: at })
    .run();
}

const A = "owner-A";
const B = "owner-B";
const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)); // seconds apart

describe("notifications projection", () => {
  let db: Db;
  let artA: string;
  let s1: string;

  beforeEach(() => {
    db = freshDb();
    artA = addArtifact(db, A, "Pitch");
    s1 = addShare(db, artA, "recipient", "Jane");
    // s1: two views (first open = earliest), a reopen, a forward.
    addEvent(db, s1, "view", t(10));
    addEvent(db, s1, "view", t(20));
    addEvent(db, s1, "reopen", t(30));
    addEvent(db, s1, "forward_suspected", t(40));

    // Another creator's share — must never appear.
    const artB = addArtifact(db, B, "Secret");
    const sB = addShare(db, artB, "recipient", "Bob");
    addEvent(db, sB, "view", t(50));
    addEvent(db, sB, "forward_suspected", t(60));
  });

  it("detects first_open (earliest view), reopen, and forward — owner-scoped", () => {
    const notes = listNotifications(A, { db });
    const types = notes.map((n) => n.type);
    expect(types).toContain("first_open");
    expect(types).toContain("reopen");
    expect(types).toContain("forward_suspected");
    // Exactly one first_open per share (not one per view).
    expect(types.filter((x) => x === "first_open")).toHaveLength(1);
    // first_open uses the earliest view timestamp.
    const open = notes.find((n) => n.type === "first_open")!;
    expect(open.createdAt.getTime()).toBe(t(10).getTime());
    // Deep link targets the recipient drill-down.
    expect(open.href).toBe(`/artifacts/${artA}/shares/${s1}`);
    // No leak of B's data.
    expect(notes.every((n) => n.artifactTitle === "Pitch")).toBe(true);
  });

  it("orders newest-first", () => {
    const notes = listNotifications(A, { db });
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
        notes[i].createdAt.getTime(),
      );
    }
  });

  it("counts unread against the watermark; markSeen clears it", () => {
    // No watermark yet → all three are unread.
    expect(unreadCount(A, { db })).toBe(3);

    // Seen up to t(35): the forward at t(40) remains unread.
    markSeen(A, t(35), { db });
    expect(unreadCount(A, { db })).toBe(1);
    const notes = listNotifications(A, { db });
    expect(notes.find((n) => n.type === "forward_suspected")!.unread).toBe(true);
    expect(notes.find((n) => n.type === "reopen")!.unread).toBe(false);

    // Seen now → nothing unread.
    markSeen(A, t(100), { db });
    expect(unreadCount(A, { db })).toBe(0);
  });

  it("markSeen upserts a single row per creator", () => {
    markSeen(A, t(1), { db });
    markSeen(A, t(2), { db });
    const rows = db.select().from(creatorPrefs).where(eq(creatorPrefs.userId, A)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].notificationsSeenAt?.getTime()).toBe(t(2).getTime());
  });

  it("does not leak across creators", () => {
    expect(listNotifications(B, { db }).every((n) => n.artifactTitle === "Secret")).toBe(
      true,
    );
    expect(unreadCount(B, { db })).toBe(2); // first_open + forward for B
  });
});
