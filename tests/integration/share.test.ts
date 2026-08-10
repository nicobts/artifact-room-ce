import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import {
  createShare,
  resolveShare,
  revokeShare,
  listShares,
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
    .run(artifactId, "creator-1", "Deck", "key-1", "text/html");
  return { db, sqlite, artifactId };
}

type ShareDb = NonNullable<
  NonNullable<Parameters<typeof createShare>[1]>["db"]
>;

async function makeShare(
  db: ShareDb,
  artifactId: string,
  overrides: Partial<Parameters<typeof createShare>[0]> = {},
) {
  const res = await createShare(
    { ownerId: "creator-1", artifactId, protection: "public", ...overrides },
    { db },
  );
  if (!res.ok) throw new Error("expected ok");
  return res;
}

describe("createShare", () => {
  it("creates a share for an owned artifact", async () => {
    const { db, artifactId } = setup();
    const res = await makeShare(db, artifactId, { recipientLabel: "Jane @ Acme" });
    expect(res.token).toBeTruthy();
    expect(listShares("creator-1", artifactId, { db })).toHaveLength(1);
  });

  it("refuses to share an artifact the caller does not own", async () => {
    const { db, artifactId } = setup();
    const res = await createShare(
      { ownerId: "intruder", artifactId, protection: "public" },
      { db },
    );
    expect(res).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("resolveShare outcomes", () => {
  it("resolves a usable token to share + artifact", async () => {
    const { db, artifactId } = setup();
    const { token } = await makeShare(db, artifactId);
    const r = resolveShare(token, {}, { db });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.artifact.title).toBe("Deck");
  });

  it("denies an unknown token (no artifact leak)", () => {
    const { db } = setup();
    expect(resolveShare("nope", {}, { db })).toEqual({ status: "denied" });
  });

  it("fails closed on revoke (immediately)", async () => {
    const { db, artifactId } = setup();
    const { id, token } = await makeShare(db, artifactId);
    expect(revokeShare("creator-1", id, { db })).toBe(true);
    expect(resolveShare(token, {}, { db }).status).toBe("denied");
  });

  it("does not let a non-owner revoke", async () => {
    const { db, artifactId } = setup();
    const { id } = await makeShare(db, artifactId);
    expect(revokeShare("intruder", id, { db })).toBe(false);
  });

  it("fails closed on expiry", async () => {
    const { db, artifactId } = setup();
    const { token } = await makeShare(db, artifactId, {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(resolveShare(token, {}, { db }).status).toBe("denied");
  });

  it("gates a password-protected share and stores no plaintext", async () => {
    const { db, sqlite, artifactId } = setup();
    const { token } = await makeShare(db, artifactId, {
      protection: "password",
      recipientEmail: "jane@acme.com",
      password: "letmein",
    });

    // The gate announces which factors it wants, but every failure is denied
    // without saying why — wrong password is indistinguishable from no token.
    expect(resolveShare(token, {}, { db })).toMatchObject({
      status: "gate",
      needsEmail: false,
      needsPassword: true,
    });
    expect(resolveShare(token, { password: "wrong" }, { db }).status).toBe("denied");
    expect(resolveShare(token, { password: "letmein" }, { db }).status).toBe("ok");

    const row = sqlite
      .prepare("SELECT password_hash FROM share WHERE token = ?")
      .get(token) as { password_hash: string };
    expect(row.password_hash).not.toContain("letmein");
    expect(row.password_hash.startsWith("scrypt$")).toBe(true);
  });
});
