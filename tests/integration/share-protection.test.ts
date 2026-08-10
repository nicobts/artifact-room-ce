import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { createShare, deriveProtection } from "@/lib/share";

function freshDb() {
  const sqlite = createSqlite(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "./db/migrations" });
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function seedArtifact(sqlite: BetterSqlite3.Database, ownerId = "creator-1") {
  const artifactId = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
    )
    .run(artifactId, ownerId, "Deck", "blob-1", "text/html");
  return artifactId;
}

function row(sqlite: BetterSqlite3.Database, id: string) {
  return sqlite
    .prepare("SELECT mode, recipient_email, password_hash FROM share WHERE id = ?")
    .get(id) as {
    mode: string;
    recipient_email: string | null;
    password_hash: string | null;
  };
}

const PW = "hunter2hunter2";

describe("createShare derives storage from protection", () => {
  it("public: mode public, no email, no hash", async () => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite);
    const r = await createShare(
      { ownerId: "creator-1", artifactId, protection: "public" },
      { db },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(row(sqlite, r.id)).toMatchObject({
      mode: "public",
      recipient_email: null,
      password_hash: null,
    });
    sqlite.close();
  });

  it("email: mode email_gated with the normalized address, no hash", async () => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite);
    const r = await createShare(
      {
        ownerId: "creator-1",
        artifactId,
        protection: "email",
        recipientEmail: "Jane@Acme.com",
      },
      { db },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = row(sqlite, r.id);
    expect(stored.mode).toBe("email_gated");
    expect(stored.recipient_email).toBe("jane@acme.com");
    expect(stored.password_hash).toBeNull();
    sqlite.close();
  });

  it("email_password: mode email_gated with address AND hash", async () => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite);
    const r = await createShare(
      {
        ownerId: "creator-1",
        artifactId,
        protection: "email_password",
        recipientEmail: "jane@acme.com",
        password: PW,
      },
      { db },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = row(sqlite, r.id);
    expect(stored.mode).toBe("email_gated");
    expect(stored.recipient_email).toBe("jane@acme.com");
    expect(stored.password_hash).toMatch(/^scrypt\$/);
    sqlite.close();
  });

  it("password: mode recipient with address AND hash", async () => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite);
    const r = await createShare(
      {
        ownerId: "creator-1",
        artifactId,
        protection: "password",
        recipientEmail: "jane@acme.com",
        password: PW,
      },
      { db },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = row(sqlite, r.id);
    expect(stored.mode).toBe("recipient");
    expect(stored.recipient_email).toBe("jane@acme.com");
    expect(stored.password_hash).toMatch(/^scrypt\$/);
    sqlite.close();
  });
});

describe("createShare rejects invalid combinations", () => {
  it.each([
    ["email without an address", { protection: "email" as const }],
    [
      "email_password without an address",
      { protection: "email_password" as const, password: PW },
    ],
    [
      "email_password without a password",
      { protection: "email_password" as const, recipientEmail: "j@a.com" },
    ],
    [
      "password without a password",
      { protection: "password" as const, recipientEmail: "j@a.com" },
    ],
    [
      "a password on a public share",
      { protection: "public" as const, password: PW },
    ],
  ])("rejects %s and writes no row", async (_label, partial) => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite);
    const r = await createShare(
      { ownerId: "creator-1", artifactId, ...partial },
      { db },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("invalid_protection");
    const n = sqlite.prepare("SELECT COUNT(*) AS n FROM share").get() as { n: number };
    expect(n.n).toBe(0);
    sqlite.close();
  });

  it("still refuses an artifact the caller does not own", async () => {
    const { sqlite, db } = freshDb();
    const artifactId = seedArtifact(sqlite, "someone-else");
    const r = await createShare(
      { ownerId: "creator-1", artifactId, protection: "public" },
      { db },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("not_found");
    sqlite.close();
  });
});

describe("deriveProtection reads storage back", () => {
  it.each([
    [{ mode: "public", passwordHash: null }, "public"],
    [{ mode: "email_gated", passwordHash: null }, "email"],
    [{ mode: "email_gated", passwordHash: "scrypt$..." }, "email_password"],
    [{ mode: "recipient", passwordHash: "scrypt$..." }, "password"],
    // Legacy combinations the previous API allowed and the four protection
    // levels can no longer produce. Shown honestly, never rewritten.
    [{ mode: "recipient", passwordHash: null }, "link_only_legacy"],
    [{ mode: "public", passwordHash: "scrypt$..." }, "password_no_recipient_legacy"],
  ])("%o -> %s", (share, expected) => {
    expect(deriveProtection(share)).toBe(expected);
  });
});
