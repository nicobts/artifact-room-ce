import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { createShare, resolveShare, type CreateShareInput } from "@/lib/share";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function freshDb() {
  const sqlite = createSqlite(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: "./db/migrations" });
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

async function make(
  db: Db,
  sqlite: BetterSqlite3.Database,
  input: Omit<CreateShareInput, "ownerId" | "artifactId">,
): Promise<string> {
  const artifactId = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO artifact (id, owner_id, title, storage_key, content_type) VALUES (?, ?, ?, ?, ?)",
    )
    .run(artifactId, "creator-1", "Deck", "blob-1", "text/html");
  const r = await createShare({ ownerId: "creator-1", artifactId, ...input }, { db });
  if (!r.ok) throw new Error(`setup failed: ${r.error}`);
  const row = sqlite.prepare("SELECT token FROM share WHERE id = ?").get(r.id) as {
    token: string;
  };
  return row.token;
}

const PW = "hunter2hunter2";

describe("resolveShare gate matrix", () => {
  it("public opens with no credentials", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, { protection: "public" });
    expect(resolveShare(token, {}, { db }).status).toBe("ok");
    sqlite.close();
  });

  it("email asks for an email, then opens on a match", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, {
      protection: "email",
      recipientEmail: "jane@acme.com",
    });

    expect(resolveShare(token, {}, { db })).toMatchObject({
      status: "gate",
      needsEmail: true,
      needsPassword: false,
    });

    expect(resolveShare(token, { email: "JANE@acme.com " }, { db }).status).toBe("ok");
    expect(resolveShare(token, { email: "other@acme.com" }, { db }).status).toBe(
      "denied",
    );
    sqlite.close();
  });

  it("email_password requires both together", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, {
      protection: "email_password",
      recipientEmail: "jane@acme.com",
      password: PW,
    });

    expect(resolveShare(token, {}, { db })).toMatchObject({
      status: "gate",
      needsEmail: true,
      needsPassword: true,
    });
    expect(resolveShare(token, { email: "jane@acme.com" }, { db }).status).toBe(
      "denied",
    );
    expect(resolveShare(token, { password: PW }, { db }).status).toBe("denied");
    expect(
      resolveShare(token, { email: "jane@acme.com", password: "wrong-one-here" }, { db })
        .status,
    ).toBe("denied");
    expect(
      resolveShare(token, { email: "jane@acme.com", password: PW }, { db }).status,
    ).toBe("ok");
    sqlite.close();
  });

  it("password asks only for a password, never the address", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, {
      protection: "password",
      recipientEmail: "jane@acme.com",
      password: PW,
    });
    expect(resolveShare(token, {}, { db })).toMatchObject({
      status: "gate",
      needsEmail: false,
      needsPassword: true,
    });
    expect(resolveShare(token, { password: PW }, { db }).status).toBe("ok");
    expect(resolveShare(token, { password: "not-the-password" }, { db }).status).toBe(
      "denied",
    );
    sqlite.close();
  });

  it("denies unknown, revoked, and expired without distinguishing them", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, { protection: "public" });

    expect(resolveShare("no-such-token", {}, { db }).status).toBe("denied");

    sqlite.prepare("UPDATE share SET revoked_at = ?").run(Date.now());
    expect(resolveShare(token, {}, { db }).status).toBe("denied");

    sqlite
      .prepare("UPDATE share SET revoked_at = NULL, expires_at = ?")
      .run(Date.now() - 1000);
    expect(resolveShare(token, {}, { db }).status).toBe("denied");
    sqlite.close();
  });

  it("denies when the artifact is soft-deleted", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, { protection: "public" });
    sqlite.prepare("UPDATE artifact SET deleted_at = ?").run(Date.now());
    expect(resolveShare(token, {}, { db }).status).toBe("denied");
    sqlite.close();
  });
});

describe("resolveShare legacy rows keep working", () => {
  it("legacy recipient-without-password opens on the link alone", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, { protection: "public" });
    sqlite.prepare("UPDATE share SET mode = 'recipient' WHERE token = ?").run(token);
    expect(resolveShare(token, {}, { db }).status).toBe("ok");
    sqlite.close();
  });

  it("legacy public-with-password still demands its password", async () => {
    const { sqlite, db } = freshDb();
    const token = await make(db, sqlite, {
      protection: "password",
      recipientEmail: "jane@acme.com",
      password: PW,
    });
    // Recreate the old shape: public mode carrying a password hash.
    sqlite
      .prepare("UPDATE share SET mode = 'public', recipient_email = NULL WHERE token = ?")
      .run(token);

    expect(resolveShare(token, {}, { db })).toMatchObject({
      status: "gate",
      needsEmail: false,
      needsPassword: true,
    });
    expect(resolveShare(token, { password: PW }, { db }).status).toBe("ok");
    sqlite.close();
  });
});
