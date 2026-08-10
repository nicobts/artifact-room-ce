import { describe, it, expect } from "vitest";
import { checkReadiness } from "@/lib/health";

describe("checkReadiness", () => {
  it("is ready when all checks pass", async () => {
    const r = await checkReadiness({
      pingDb: () => true,
      migrationsAtHead: () => true,
      storageWritable: async () => true,
    });
    expect(r.ready).toBe(true);
  });

  it("is not ready when migrations are behind", async () => {
    const r = await checkReadiness({
      pingDb: () => true,
      migrationsAtHead: () => false,
      storageWritable: async () => true,
    });
    expect(r.ready).toBe(false);
    expect(r.checks.migrations).toBe(false);
  });

  it("is not ready when storage is unwritable", async () => {
    const r = await checkReadiness({
      pingDb: () => true,
      migrationsAtHead: () => true,
      storageWritable: async () => {
        throw new Error("read-only");
      },
    });
    expect(r.ready).toBe(false);
    expect(r.checks.storage).toBe(false);
  });

  it("is not ready when the database is unreachable", async () => {
    const r = await checkReadiness({
      pingDb: () => {
        throw new Error("down");
      },
      migrationsAtHead: () => true,
      storageWritable: async () => true,
    });
    expect(r.ready).toBe(false);
    expect(r.checks.db).toBe(false);
  });
});
