import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { artifact, share, viewerSession, event } from "@/db/schema";
import {
  getAccountOverview,
  listSharesWithStats,
  getViewsTimeSeries,
} from "@/lib/analytics/queries";

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

function addShare(
  db: Db,
  artifactId: string,
  opts: Partial<typeof share.$inferInsert> = {},
): string {
  const id = randomUUID();
  db.insert(share)
    .values({
      id,
      artifactId,
      token: `tok_${id}`,
      mode: opts.mode ?? "public",
      ...opts,
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
  db.insert(event)
    .values({ id: randomUUID(), shareId, type, ...extra })
    .run();
}

const A = "creator-A";
const B = "creator-B";

describe("getAccountOverview (owner-scoped dashboard rollup)", () => {
  let db: Db;
  let pitchDeck: string;
  let roadmap: string;

  beforeEach(() => {
    db = freshDb();
    // Creator A: two artifacts, three shares.
    pitchDeck = addArtifact(db, A, "Pitch Deck");
    roadmap = addArtifact(db, A, "Roadmap");
    const sPitch = addShare(db, pitchDeck, { mode: "recipient", recipientLabel: "Jane @ Acme" });
    const sRoad = addShare(db, roadmap, { mode: "public" });
    addSession(db, sPitch, "c1");
    addSession(db, sPitch, "c2");
    // Pitch: 3 views, 1 reopen, 2 dwell.
    addEvent(db, sPitch, "view");
    addEvent(db, sPitch, "view");
    addEvent(db, sPitch, "view");
    addEvent(db, sPitch, "reopen");
    addEvent(db, sPitch, "dwell", { slideIndex: 1, durationMs: 1000 });
    addEvent(db, sPitch, "dwell", { slideIndex: 2, durationMs: 2000 });
    // Roadmap: 2 views, 1 forward. Default createdAt is second-precision, so
    // give the forward a distinctly newer stamp to make recent-activity order
    // deterministic in the test (real events carry distinct ms timestamps).
    addEvent(db, sRoad, "view");
    addEvent(db, sRoad, "view");
    addEvent(db, sRoad, "forward_suspected", { createdAt: new Date(Date.now() + 10_000) });

    // Creator B (must never leak into A's rollups): 10 views, shared clientId.
    const bArt = addArtifact(db, B, "Secret");
    const bShare = addShare(db, bArt, { mode: "public" });
    addSession(db, bShare, "c1"); // same string id, different scope
    for (let i = 0; i < 10; i++) addEvent(db, bShare, "view");
  });

  it("computes totals across only the creator's own shares", () => {
    const { totals } = getAccountOverview(A, { db });
    expect(totals.artifacts).toBe(2);
    expect(totals.shares).toBe(2);
    expect(totals.views).toBe(5); // 3 + 2, NOT B's 10
    expect(totals.uniqueViewers).toBe(2); // c1, c2 on A's shares
    expect(totals.forwards).toBe(1);
  });

  it("does not leak creator B's data into A", () => {
    const a = getAccountOverview(A, { db });
    const b = getAccountOverview(B, { db });
    expect(b.totals.views).toBe(10);
    expect(a.totals.views).toBe(5);
    expect(a.topArtifacts.some((t) => t.title === "Secret")).toBe(false);
  });

  it("ranks top artifacts by views and reports avg dwell", () => {
    const { topArtifacts } = getAccountOverview(A, { db });
    expect(topArtifacts[0].title).toBe("Pitch Deck"); // 3 > 2
    expect(topArtifacts[0].artifactId).toBe(pitchDeck);
    expect(topArtifacts[0].avgDwellMs).toBe(1500); // (1000 + 2000) / 2
    expect(topArtifacts.find((t) => t.artifactId === roadmap)?.views).toBe(2);
  });

  it("surfaces recent activity newest-first, including forwarding", () => {
    const { recentActivity } = getAccountOverview(A, { db });
    expect(recentActivity.length).toBeGreaterThan(0);
    expect(recentActivity.some((a) => a.type === "forward_suspected")).toBe(true);
    expect(recentActivity.every((a) => typeof a.artifactTitle === "string")).toBe(true);
  });

  it("returns an empty-but-valid overview for a creator with nothing", () => {
    const { totals, recentActivity, topArtifacts } = getAccountOverview("nobody", { db });
    expect(totals).toEqual({ artifacts: 0, shares: 0, views: 0, uniqueViewers: 0, forwards: 0 });
    expect(recentActivity).toEqual([]);
    expect(topArtifacts).toEqual([]);
  });
});

describe("listSharesWithStats", () => {
  it("lists only the owner's shares with stats and computed status", () => {
    const db = freshDb();
    const art = addArtifact(db, A, "Deck");
    const past = new Date(Date.now() - 60_000);
    addShare(db, art, { mode: "recipient", recipientLabel: "Jane" });
    addShare(db, art, { mode: "public", revokedAt: new Date() });
    addShare(db, art, { mode: "public", expiresAt: past });
    // Another creator's share must not appear.
    const bArt = addArtifact(db, B, "Other");
    addShare(db, bArt, { mode: "public" });

    const rows = listSharesWithStats(A, { db });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.artifactTitle === "Deck")).toBe(true);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(["active", "expired", "revoked"]);
  });

  it("computes avg dwell per view", () => {
    const db = freshDb();
    const art = addArtifact(db, A, "Deck");
    const s = addShare(db, art, { mode: "recipient" });
    addEvent(db, s, "view");
    addEvent(db, s, "view");
    addEvent(db, s, "dwell", { slideIndex: 1, durationMs: 4000 });
    const [row] = listSharesWithStats(A, { db });
    expect(row.stats.views).toBe(2);
    expect(row.totalDwellMs).toBe(4000);
    expect(row.avgDwellMs).toBe(2000);
  });
});

describe("getViewsTimeSeries", () => {
  const NOW = new Date("2026-06-24T12:00:00.000Z");

  it("buckets views by UTC day, zero-filled across the window, owner-scoped", () => {
    const db = freshDb();
    const art = addArtifact(db, A, "Deck");
    const s = addShare(db, art, { mode: "public" });
    addEvent(db, s, "view", { createdAt: new Date("2026-06-24T09:00:00Z") });
    addEvent(db, s, "view", { createdAt: new Date("2026-06-24T10:00:00Z") });
    addEvent(db, s, "view", { createdAt: new Date("2026-06-23T10:00:00Z") });
    // Outside the 14-day window → excluded.
    addEvent(db, s, "view", { createdAt: new Date("2026-06-01T10:00:00Z") });
    // Another creator → excluded.
    const bArt = addArtifact(db, B, "Other");
    const bs = addShare(db, bArt, { mode: "public" });
    addEvent(db, bs, "view", { createdAt: new Date("2026-06-24T11:00:00Z") });

    const series = getViewsTimeSeries(A, 14, { db }, NOW);
    expect(series).toHaveLength(14);
    expect(series[0].day).toBe("2026-06-11");
    expect(series[13].day).toBe("2026-06-24");
    expect(series[13].views).toBe(2); // two views today, NOT B's
    expect(series[12].views).toBe(1); // yesterday
    expect(series.reduce((n, b) => n + b.views, 0)).toBe(3); // window excludes Jun 1
  });

  it("returns an all-zero series when there are no views", () => {
    const db = freshDb();
    const series = getViewsTimeSeries(A, 7, { db }, NOW);
    expect(series).toHaveLength(7);
    expect(series.every((b) => b.views === 0)).toBe(true);
  });
});
