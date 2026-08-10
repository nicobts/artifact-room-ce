import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";
import * as schema from "@/db/schema";
import { DiskStorage } from "@/lib/storage/disk";
import { createArtifact, reuploadArtifact, listArtifacts } from "@/lib/artifacts";

const dir = mkdtempSync(join(tmpdir(), "artifact-room-bundle-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function freshDb() {
  const sqlite = createSqlite(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./db/migrations" });
  return db;
}

const bundleHtml =
  `<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head>` +
  `<body><h1>Deck</h1><div data-slide></div><div data-slide></div>` +
  `<img src="assets/logo.png"></body></html>`;

function cleanBundle(): Buffer {
  return Buffer.from(
    zipSync({
      "index.html": strToU8(bundleHtml),
      "assets/style.css": strToU8("h1{color:teal}"),
      "assets/logo.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
  );
}

describe("zip bundle upload (createArtifact)", () => {
  it("stores exactly ONE normalized text/html blob with assets inlined", async () => {
    const db = freshDb();
    const blobDir = join(dir, "clean");
    const storage = new DiskStorage(blobDir);

    const res = await createArtifact(
      { ownerId: "creator-1", title: "Bundle", bytes: cleanBundle() },
      { db, storage },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.advisories).toContain("bundle-inlined");
    expect(res.slideCount).toBe(2);

    const rows = listArtifacts("creator-1", { db });
    expect(rows).toHaveLength(1);
    expect(rows[0].contentType).toBe("text/html");

    const blob = await storage.get(rows[0].storageKey);
    const html = blob!.data.toString("utf8");
    expect(blob!.contentType).toBe("text/html");
    expect(html).toContain("<style>h1{color:teal}</style>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("assets/");
    expect(rows[0].sizeBytes).toBe(blob!.data.length);

    // Single-file contract: one blob + its .meta sidecar, nothing per-asset.
    expect(readdirSync(blobDir)).toHaveLength(2);
  });

  it("rejects a bundle whose JS asset fails the scan and stores NOTHING", async () => {
    const db = freshDb();
    const blobDir = join(dir, "evil");
    const storage = new DiskStorage(blobDir);

    const evil = Buffer.from(
      zipSync({
        "index.html": strToU8(
          `<!doctype html><html><body><script src="assets/app.js"></script></body></html>`,
        ),
        // eval(atob(...)) trips the obfuscation heuristic AFTER inlining.
        "assets/app.js": strToU8(`eval(atob("YWxlcnQoMSk="))`),
      }),
    );

    const res = await createArtifact(
      { ownerId: "creator-1", title: "Evil", bytes: evil },
      { db, storage },
    );

    expect(res.ok).toBe(false);
    expect(listArtifacts("creator-1", { db })).toHaveLength(0);
    // storage.put never ran — the blob dir was never even created.
    expect(existsSync(blobDir)).toBe(false);
  });

  it("rejects a malformed bundle (two root HTML files) with a bundle rule", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "malformed"));
    const bad = Buffer.from(
      zipSync({ "a.html": strToU8("<html></html>"), "b.html": strToU8("<html></html>") }),
    );

    const res = await createArtifact(
      { ownerId: "creator-1", title: "Bad", bytes: bad },
      { db, storage },
    );
    expect(res).toMatchObject({ ok: false, rule: "bundle-html-count" });
    expect(listArtifacts("creator-1", { db })).toHaveLength(0);
  });

  it("rejects a decompression bomb and stores NOTHING", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "bomb"));
    const bomb = Buffer.from(
      zipSync({
        "index.html": strToU8("<html></html>"),
        "assets/zeros.txt": new Uint8Array(4_900_000),
      }),
    );

    const res = await createArtifact(
      { ownerId: "creator-1", title: "Bomb", bytes: bomb },
      { db, storage },
    );
    expect(res).toMatchObject({ ok: false, rule: "bundle-bomb" });
    expect(listArtifacts("creator-1", { db })).toHaveLength(0);
  });
});

describe("zip bundle reupload (reuploadArtifact)", () => {
  it("replaces in place with a normalized bundle, bumping version", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "reup"));

    const first = await createArtifact(
      {
        ownerId: "creator-1",
        title: "V1",
        bytes: Buffer.from("<!doctype html><html><body>v1</body></html>"),
      },
      { db, storage },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const res = await reuploadArtifact("creator-1", first.id, cleanBundle(), {
      db,
      storage,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.version).toBe(2);
    expect(res.advisories).toContain("bundle-inlined");

    const rows = listArtifacts("creator-1", { db });
    const blob = await storage.get(rows[0].storageKey);
    expect(blob!.data.toString("utf8")).toContain("<style>h1{color:teal}</style>");
  });

  it("keeps the previous version serving when the bundle is rejected", async () => {
    const db = freshDb();
    const storage = new DiskStorage(join(dir, "reup-reject"));

    const original = "<!doctype html><html><body>v1</body></html>";
    const first = await createArtifact(
      { ownerId: "creator-1", title: "V1", bytes: Buffer.from(original) },
      { db, storage },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const bad = Buffer.from(zipSync({ "assets/only.css": strToU8("a{}") }));
    const res = await reuploadArtifact("creator-1", first.id, bad, { db, storage });
    expect(res.ok).toBe(false);

    const rows = listArtifacts("creator-1", { db });
    expect(rows[0].version).toBe(1);
    const blob = await storage.get(rows[0].storageKey);
    expect(blob!.data.toString("utf8")).toBe(original);
  });
});
