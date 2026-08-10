import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { artifact, share, viewerSession, event } from "@/db/schema";
import { getShareTimeline } from "@/lib/analytics/queries";

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
function addSession(db: Db, shareId: string, clientId: string): string {
  const id = randomUUID();
  db.insert(viewerSession).values({ id, shareId, clientId }).run();
  return id;
}
function addEvent(
  db: Db,
  shareId: string,
  type: typeof event.$inferInsert.type,
  extra: Partial<typeof event.$inferInsert> = {},
): void {
  db.insert(event).values({ id: randomUUID(), shareId, type, ...extra }).run();
}

const A = "owner-A";
const B = "owner-B";

describe("getShareTimeline", () => {
  let db: Db;
  let artA: string;
  let s1: string;
  let vs1: string;
  let vs2: string;

  beforeEach(() => {
    db = freshDb();
    artA = addArtifact(db, A, "Pitch");
    s1 = addShare(db, artA, "recipient", "Jane");
    vs1 = addSession(db, s1, "client-1");
    vs2 = addSession(db, s1, "client-2"); // second client = forwarding signal

    // vs1: opened, dwelled on slides 1 & 2, reopened.
    addEvent(db, s1, "view", { viewerSessionId: vs1 });
    addEvent(db, s1, "dwell", { viewerSessionId: vs1, slideIndex: 1, durationMs: 1000 });
    addEvent(db, s1, "dwell", { viewerSessionId: vs1, slideIndex: 2, durationMs: 600 });
    addEvent(db, s1, "reopen", { viewerSessionId: vs1 });
    // vs2: opened, only reached slide 1; forwarding suspected.
    addEvent(db, s1, "view", { viewerSessionId: vs2 });
    addEvent(db, s1, "dwell", { viewerSessionId: vs2, slideIndex: 1, durationMs: 400 });
    addEvent(db, s1, "forward_suspected", { viewerSessionId: vs2 });

    // A different share + owner B — must never bleed in.
    const s2 = addShare(db, artA, "public");
    addEvent(db, s2, "view");
    const bArt = addArtifact(db, B, "Secret");
    addEvent(db, addShare(db, bArt, "recipient", "Bob"), "view");
  });

  it("returns null for a share the caller does not own (no leak)", () => {
    expect(getShareTimeline(B, s1, { db })).toBeNull();
  });

  it("computes totals only from this share's events", () => {
    const tl = getShareTimeline(A, s1, { db })!;
    expect(tl).not.toBeNull();
    expect(tl.recipientLabel).toBe("Jane");
    expect(tl.mode).toBe("recipient");
    expect(tl.status).toBe("active");
    expect(tl.totals.views).toBe(2);
    expect(tl.totals.uniqueViewers).toBe(2);
    expect(tl.totals.reopens).toBe(1);
    expect(tl.totals.forwards).toBe(1);
    expect(tl.totals.totalDwellMs).toBe(2000); // 1000 + 600 + 400
  });

  it("builds a per-slide funnel with reached + drop-off", () => {
    const tl = getShareTimeline(A, s1, { db })!;
    // Slide 1 reached by both sessions; slide 2 by only one → drop-off.
    expect(tl.funnel).toEqual([
      { slideIndex: 1, reached: 2, totalMs: 1400 },
      { slideIndex: 2, reached: 1, totalMs: 600 },
    ]);
  });

  it("surfaces the session timeline with reopen counts", () => {
    const tl = getShareTimeline(A, s1, { db })!;
    expect(tl.sessions).toHaveLength(2);
    const byClient = Object.fromEntries(tl.sessions.map((s) => [s.clientId, s]));
    expect(byClient["client-1"].reopens).toBe(1);
    expect(byClient["client-1"].events).toBe(4);
    expect(byClient["client-2"].reopens).toBe(0);
  });

  it("surfaces suspected-forwarding events", () => {
    const tl = getShareTimeline(A, s1, { db })!;
    expect(tl.forwards).toHaveLength(1);
  });
});
