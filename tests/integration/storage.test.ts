import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskStorage } from "@/lib/storage/disk";

describe("DiskStorage round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "artifact-room-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("puts, gets, and deletes a blob with its content type", async () => {
    const storage = new DiskStorage(dir);
    const bytes = Buffer.from("<!doctype html><title>hi</title>");

    await storage.put("artifact-1", bytes, "text/html");

    const got = await storage.get("artifact-1");
    expect(got).not.toBeNull();
    expect(got?.contentType).toBe("text/html");
    expect(got?.data.equals(bytes)).toBe(true);

    await storage.delete("artifact-1");
    expect(await storage.get("artifact-1")).toBeNull();
  });

  it("returns null for a missing key", async () => {
    const storage = new DiskStorage(dir);
    expect(await storage.get("nope")).toBeNull();
  });
});
