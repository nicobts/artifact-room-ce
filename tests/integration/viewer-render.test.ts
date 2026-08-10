import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import {
  createShare,
  getViewableArtifact,
  resolveShare,
  revokeShare,
} from "@/lib/share";

function setup() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  const artifactId = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
    )
    .run(artifactId, "c1", "Deck", "key-1", "text/html");
  return { db, artifactId };
}

describe("viewer render access", () => {
  it("the gate carries the opaque shareId (no artifact info)", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      {
        ownerId: "c1",
        artifactId,
        protection: "password",
        recipientEmail: "jane@acme.com",
        password: "pw",
      },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    const r = resolveShare(s.token, {}, { db });
    expect(r.status).toBe("gate");
    if (r.status === "gate") expect(r.shareId).toBe(s.id);
  });

  it("getViewableArtifact bypasses the password gate but enforces revoke/expiry", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      {
        ownerId: "c1",
        artifactId,
        protection: "password",
        recipientEmail: "jane@acme.com",
        password: "pw",
      },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");

    // Password is ignored here (the raw endpoint calls this only after verifying
    // the access cookie).
    expect(getViewableArtifact(s.token, { db })).not.toBeNull();

    // Revoked -> not viewable.
    revokeShare("c1", s.id, { db });
    expect(getViewableArtifact(s.token, { db })).toBeNull();
  });

  it("getViewableArtifact refuses an expired share", async () => {
    const { db, artifactId } = setup();
    const s = await createShare(
      {
        ownerId: "c1",
        artifactId,
        protection: "public",
        expiresAt: new Date(Date.now() - 1000),
      },
      { db },
    );
    if (!s.ok) throw new Error("expected ok");
    expect(getViewableArtifact(s.token, { db })).toBeNull();
  });
});
