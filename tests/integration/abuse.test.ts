import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { createShare, resolveShare } from "@/lib/share";
import { createArtifact } from "@/lib/artifacts";
import { DiskStorage } from "@/lib/storage/disk";
import {
  createAbuseReport,
  listReports,
  adminTakedown,
  addSignature,
  getEnabledSignatures,
} from "@/lib/abuse";

const dir = mkdtempSync(join(tmpdir(), "artifact-room-abuse-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

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
  return { db, artifactId };
}

describe("abuse reports", () => {
  it("stores a pending report", () => {
    const { db } = setup();
    createAbuseReport({ reportedToken: "tok", reason: "phishing" }, { db });
    const reports = listReports({ db });
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe("pending");
  });
});

describe("admin takedown", () => {
  it("revokes a share by token (fail-closed, immediate)", async () => {
    const { db, artifactId } = setup();
    const s = await createShare({ ownerId: "c1", artifactId, protection: "public" }, { db });
    if (!s.ok) throw new Error("expected ok");
    expect(resolveShare(s.token, {}, { db }).status).toBe("ok");

    const r = adminTakedown({ token: s.token }, { db });
    expect(r.revokedShares).toBe(1);
    expect(resolveShare(s.token, {}, { db }).status).toBe("denied");
  });

  it("soft-deletes an artifact and revokes all its shares", async () => {
    const { db, artifactId } = setup();
    const s = await createShare({ ownerId: "c1", artifactId, protection: "public" }, { db });
    if (!s.ok) throw new Error("expected ok");

    const r = adminTakedown({ artifactId }, { db });
    expect(r.softDeletedArtifact).toBe(true);
    expect(r.revokedShares).toBe(1);
    expect(resolveShare(s.token, {}, { db }).status).toBe("denied");
  });
});

describe("signature-driven scanning", () => {
  it("a newly added signature blocks a subsequent matching upload", async () => {
    const { db } = setup();
    const storage = new DiskStorage(join(dir, randomUUID()));
    const sample =
      "<!doctype html><html><body>TOTALLY_EVIL_KIT_MARKER</body></html>";

    // Before: nothing matches -> accepted.
    const before = await createArtifact(
      { ownerId: "c1", title: "x", bytes: Buffer.from(sample) },
      { db, storage },
    );
    expect(before.ok).toBe(true);

    // Admin adds a signature (no redeploy).
    addSignature({ pattern: "TOTALLY_EVIL_KIT_MARKER" }, { db });
    expect(getEnabledSignatures({ db })).toContain("TOTALLY_EVIL_KIT_MARKER");

    // After: the same content is rejected at scan time.
    const after = await createArtifact(
      { ownerId: "c1", title: "y", bytes: Buffer.from(sample) },
      { db, storage },
    );
    expect(after).toMatchObject({ ok: false, rule: "signature" });
  });
});
